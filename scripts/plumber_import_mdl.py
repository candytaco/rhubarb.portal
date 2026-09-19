import argparse
import json
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Importing this module loads the Plumber API and provides the search path
# helpers shared with the VMF import.
import plumber_import_vmf

from bl_ext.user_default.plumber.api import import_mdl


def parseArgs():
	"""Parse the arguments that follow Blender's ``--`` separator.

	:returns:	populated argparse namespace
	"""

	parser = argparse.ArgumentParser()
	parser.add_argument("--model", required = True, action = "append", default = [],
	                    help = "<mdl path inside the game files>=<output glb path>, repeatable")
	parser.add_argument("--game-dir", required = False, default = None)
	parser.add_argument("--extra-search-path", required = False, action = "append", default = [])

	argv = sys.argv
	if "--" in argv:
		argv = argv[argv.index("--") + 1 :]
	else:
		argv = []

	return parser.parse_args(argv)


def readConfiguredGameDirectory():
	"""Read game-dir from the map converter configuration file.

	:returns:	configured game directory, or None when it is not set
	"""

	configPath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "convert-config.json")
	if not os.path.isfile(configPath):
		return None

	with open(configPath, "r", encoding = "utf-8") as handle:
		config = json.load(handle)

	return config.get("game-dir")


def splitModelArgument(value):
	"""Split one --model value into the model path and the output path.

	:param value:	"<mdl path inside the game files>=<output glb path>" pair
	:returns:		tuple of model path and output path
	"""

	modelPath, separator, outputPath = value.partition("=")
	modelPath = modelPath.strip()
	outputPath = outputPath.strip()
	if not separator or not modelPath or not outputPath:
		raise RuntimeError("Invalid --model value: {0}".format(value))

	return modelPath, outputPath


def removeArmatureObjects():
	"""Delete the scene's armature objects, leaving each mesh in the pose it was imported in."""

	for sceneObject in list(bpy.context.scene.objects):
		if sceneObject.type == "ARMATURE":
			bpy.data.objects.remove(sceneObject, do_unlink = True)


def standUpModelObjects():
	"""Rotate the imported objects so the model stands along +Z.

	Plumber imports model meshes standing along +Y while Blender and Source are both Z-up, which
	leaves every model lying on its back.
	"""

	for sceneObject in bpy.context.scene.objects:
		if sceneObject.parent is None:
			sceneObject.rotation_euler = (math.radians(90.0), 0.0, 0.0)


def importAndExportModel(fileSystem, modelPath, outputPath):
	"""Import one MDL into an empty scene and write it out as a GLB.

	:param fileSystem:	Plumber GameFileSystem the model is read through
	:param modelPath:	path of the MDL inside the game files
	:param outputPath:	path of the GLB to write
	"""

	bpy.ops.wm.read_factory_settings(use_empty = True)

	import_mdl(
		fileSystem,
		modelPath,
		from_game = True,
		material_import_materials = True,
		material_simple_materials = True,
		material_texture_format = "Png",
		mdl_import_animations = False,
		mdl_remove_animations = True,
		mdl_apply_armatures = True,
	)

	removeArmatureObjects()
	standUpModelObjects()

	outputDirectory = os.path.dirname(outputPath)
	if outputDirectory:
		os.makedirs(outputDirectory, exist_ok = True)

	bpy.ops.export_scene.gltf(
		filepath = outputPath,
		export_format = "GLB",
		export_apply = True,
		export_animations = False,
		export_lights = False,
	)


def main():
	"""Export every requested game model as a GLB, one scene per model."""

	args = parseArgs()

	gameDirectory = args.game_dir or readConfiguredGameDirectory()
	if not gameDirectory or not os.path.isdir(gameDirectory):
		raise RuntimeError("Game directory not found: {0}".format(gameDirectory))

	extraPaths = plumber_import_vmf.split_search_paths(args.extra_search_path)
	searchPaths = plumber_import_vmf.build_search_paths(gameDirectory, None, extraPaths)
	fileSystem = plumber_import_vmf.GameFileSystem.from_search_paths("Portal 2", searchPaths)

	for modelArgument in args.model:
		modelPath, outputPath = splitModelArgument(modelArgument)
		importAndExportModel(fileSystem, modelPath, outputPath)


if __name__ == "__main__":
	main()
