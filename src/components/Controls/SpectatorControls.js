import * as THREE from 'three'
import { clamp } from 'lodash'
import keycode from 'keycode'

// Custom override of SpectatorControls by isRyven
// https://github.com/isRyven/SpectatorControls

// actions
const FORWARD = 1 << 0
const LEFT = 1 << 1
const RIGHT = 1 << 2
const BACK = 1 << 3
const UP = 1 << 4
const DOWN = 1 << 5
const SPRINT = 1 << 6

// drag modes
const DRAG_NONE = 0
const DRAG_PAN = 1
const DRAG_PAN_VERTICAL = 2
const DRAG_ROTATE = 3

// defaults
const MOVESPEED = 20
const FRICTION = 0.8
const LOOKSPEED = 5
const SPRINTMULT = 3
const PANSPEED = 1 // multiplier on the ground-grab pan rate
const FALLBACKPANDISTANCE = 1000 // pan reference distance when the view ray misses the ground plane
const MOVESPEEDSTEP = 1.2
const MINMOVESPEED = 2
const MAXMOVESPEED = 320
const KEYMAPPING = {
  [keycode('w')]: 'FORWARD',
  [keycode('a')]: 'LEFT',
  [keycode('s')]: 'BACK',
  [keycode('d')]: 'RIGHT',
  [keycode('q')]: 'DOWN',
  [keycode('e')]: 'UP',
  [keycode('shift')]: 'SPRINT',
}
const MOUSEMAPPING = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2,
}

export class SpectatorControls {
  constructor(camera, domElement) {
    this.camera = camera
    this.domElement = domElement
    this.lookSpeed = LOOKSPEED
    this.moveSpeed = MOVESPEED
    this.panSpeed = PANSPEED
    this.groundZ = 0
    this.moveSpeedStep = MOVESPEEDSTEP
    this.minMoveSpeed = MINMOVESPEED
    this.maxMoveSpeed = MAXMOVESPEED
    this.onMoveSpeedChange = null
    this.friction = FRICTION
    this.sprintMultiplier = SPRINTMULT
    this.keyMapping = Object.assign({}, KEYMAPPING, KEYMAPPING)
    this.enabled = false
    this.allowInput = true
    this._mouseState = { x: 0, y: 0 }
    this._dragState = { mode: DRAG_NONE, x: 0, y: 0 }
    this._keyState = { press: 0, prevPress: 0 }
    this._moveState = { velocity: new THREE.Vector3(0, 0, 0) }
    this._processMouseMoveEvent = this._processMouseMoveEvent.bind(this)
    this._processMouseDownEvent = this._processMouseDownEvent.bind(this)
    this._processMouseUpEvent = this._processMouseUpEvent.bind(this)
    this._processWheelEvent = this._processWheelEvent.bind(this)
    this._processContextMenuEvent = this._processContextMenuEvent.bind(this)
    this._processKeyEvent = this._processKeyEvent.bind(this)
    this.isEnabled = this.isEnabled.bind(this)
  }
  _processMouseDownEvent(event) {
    if (!this.enabled || !this.allowInput) return null

    switch (event.button) {
      case MOUSEMAPPING.LEFT:
        this._dragState.mode = DRAG_PAN
        break

      case MOUSEMAPPING.MIDDLE:
        this._dragState.mode = DRAG_PAN_VERTICAL
        break

      case MOUSEMAPPING.RIGHT:
        this._dragState.mode = DRAG_ROTATE
        break

      default:
        this._dragState.mode = DRAG_NONE
        return null
    }

    // preventDefault keeps the click from focusing the canvas, whose key handler needs the focus
    this.domElement.focus()
    event.preventDefault()

    this._dragState.x = event.clientX
    this._dragState.y = event.clientY

    document.addEventListener('mousemove', this._processMouseMoveEvent)
    document.addEventListener('mouseup', this._processMouseUpEvent)
  }
  _processMouseMoveEvent(event) {
    if (this._dragState.mode === DRAG_NONE) return null

    const deltaX = event.clientX - this._dragState.x
    const deltaY = event.clientY - this._dragState.y

    this._dragState.x = event.clientX
    this._dragState.y = event.clientY

    if (this._dragState.mode === DRAG_ROTATE) {
      this._processMouseMove(deltaX, deltaY)
    } else {
      this._panCamera(deltaX, deltaY, this._dragState.mode === DRAG_PAN_VERTICAL)
    }
  }
  _processMouseMove(x = 0, y = 0) {
    // division by clientHeight makes sensitivity consistent between different window dimensions
    this._mouseState = {
      x: (2 * Math.PI * x) / this.domElement.clientHeight,
      y: (2 * Math.PI * y) / this.domElement.clientHeight,
    }
  }
  _processMouseUpEvent(/*event*/) {
    this._dragState.mode = DRAG_NONE
    this._mouseState = { x: 0, y: 0 }

    document.removeEventListener('mousemove', this._processMouseMoveEvent)
    document.removeEventListener('mouseup', this._processMouseUpEvent)
  }
  _processWheelEvent(event) {
    if (!this.enabled || !this.allowInput) return null

    event.preventDefault()

    // The wheel sets how fast the movement keys move the camera
    if (event.deltaY < 0) {
      this.moveSpeed *= this.moveSpeedStep
    } else if (event.deltaY > 0) {
      this.moveSpeed /= this.moveSpeedStep
    }

    this.moveSpeed = clamp(this.moveSpeed, this.minMoveSpeed, this.maxMoveSpeed)
    if (this.onMoveSpeedChange) this.onMoveSpeedChange(this.moveSpeed)
  }
  _processContextMenuEvent(event) {
    if (!this.enabled) return null

    event.preventDefault()
  }
  _processKeyEvent(event) {
    if (!this.allowInput) return null
    if (this._isTypingTarget(event.target)) return null

    this._processKey(event.keyCode, event.type === 'keydown')
  }
  _isTypingTarget(target) {
    if (!target) return false
    if (target.isContentEditable === true) return true
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
  }
  _processKey(key, isPressed) {
    const { press } = this._keyState
    let newPress = press
    switch (this.keyMapping[key]) {
      case 'FORWARD':
        isPressed ? (newPress |= FORWARD) : (newPress &= ~FORWARD)
        break
      case 'BACK':
        isPressed ? (newPress |= BACK) : (newPress &= ~BACK)
        break
      case 'LEFT':
        isPressed ? (newPress |= LEFT) : (newPress &= ~LEFT)
        break
      case 'RIGHT':
        isPressed ? (newPress |= RIGHT) : (newPress &= ~RIGHT)
        break
      case 'UP':
        isPressed ? (newPress |= UP) : (newPress &= ~UP)
        break
      case 'DOWN':
        isPressed ? (newPress |= DOWN) : (newPress &= ~DOWN)
        break
      case 'SPRINT':
        isPressed ? (newPress |= SPRINT) : (newPress &= ~SPRINT)
        break
      default:
        break
    }
    this._keyState.press = newPress
  }
  listen() {
    this.domElement.addEventListener('mousedown', this._processMouseDownEvent)
    this.domElement.addEventListener('wheel', this._processWheelEvent, { passive: false })
    this.domElement.addEventListener('contextmenu', this._processContextMenuEvent)
  }
  unlisten() {
    this.domElement.removeEventListener('mousedown', this._processMouseDownEvent)
    this.domElement.removeEventListener('wheel', this._processWheelEvent)
    this.domElement.removeEventListener('contextmenu', this._processContextMenuEvent)
  }
  enable() {
    if (this.isEnabled()) return null
    document.addEventListener('keydown', this._processKeyEvent)
    document.addEventListener('keyup', this._processKeyEvent)
    this.enabled = true
    this.camera.rotation.reorder('ZYX')
  }
  disable() {
    if (!this.isEnabled()) return null
    document.removeEventListener('keydown', this._processKeyEvent)
    document.removeEventListener('keyup', this._processKeyEvent)
    this._processMouseUpEvent()
    this.enabled = false
    this._keyState.press = 0
    this._keyState.prevPress = 0
    this._mouseState = { x: 0, y: 0 }
    this.camera.rotation.reorder('XYZ')
  }
  isEnabled() {
    return this.enabled
  }
  dispose() {
    this.unlisten()
    this.disable()
  }
  update(delta = 1) {
    if (!this.enabled) {
      // finish move transition
      if (this._moveState.velocity.length() > 0) {
        this._moveCamera(this._moveState.velocity)
      }
      return
    }

    // view angles
    const lon = this._mouseState.x * delta * (this.lookSpeed / 10)
    const lat = this._mouseState.y * delta * (this.lookSpeed / 10)

    // keep vertical mouse angles within 180deg
    this.camera.rotation.x = clamp(this.camera.rotation.x - lat, 0, Math.PI)

    // keep horizontal mouse angles within 360deg
    // NOTE: this is rotation.z instead of rotation.y because our DefaultUp is Z axis!
    this.camera.rotation.z = (this.camera.rotation.z - lon) % (Math.PI * 2)

    this._mouseState = { x: 0, y: 0 }

    // movements: W and S follow the camera's look vector, A and D strafe in the ground plane,
    // E and Q move along the world up axis
    let actualMoveSpeed = delta * this.moveSpeed
    const { press } = this._keyState

    if (press & SPRINT) actualMoveSpeed *= this.sprintMultiplier

    const desired = new THREE.Vector3(0, 0, 0)
    const forward = this._lookForward()
    const right = this._groundRight()

    if (press & FORWARD) desired.add(forward)
    if (press & BACK) desired.sub(forward)
    if (press & RIGHT) desired.add(right)
    if (press & LEFT) desired.sub(right)
    if (press & UP) desired.z += 1
    if (press & DOWN) desired.z -= 1

    const velocity = this._moveState.velocity.clone()
    if (desired.lengthSq() > 0) {
      velocity.copy(desired.setLength(actualMoveSpeed))
    }

    this._moveCamera(velocity)

    this._moveState.velocity = velocity
    this._keyState.prevPress = press
  }
  _lookForward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize()
  }
  _groundForward() {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    forward.z = 0

    // Looking straight down leaves no heading, so take it from the camera's own up axis instead
    if (forward.lengthSq() < 1e-8) {
      forward.set(0, 1, 0).applyQuaternion(this.camera.quaternion)
      forward.z = 0
    }

    return forward.normalize()
  }
  _groundRight() {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion)
    right.z = 0
    return right.normalize()
  }
  _panUnitsPerPixel() {
    // Distance along the view ray to the ground plane, so a dragged ground point follows the
    // cursor at any altitude; a ray that misses the plane uses a fixed reference distance
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    let distance = FALLBACKPANDISTANCE

    if (direction.z < -1e-6) {
      const hitDistance = (this.groundZ - this.camera.position.z) / direction.z
      if (hitDistance > 0) distance = hitDistance
    }

    const halfHeight = distance * Math.tan((this.camera.fov / 2) * (Math.PI / 180))
    return ((2 * halfHeight) / this.domElement.clientHeight) * this.panSpeed
  }
  _panCamera(deltaX, deltaY, vertical) {
    const unitsPerPixel = this._panUnitsPerPixel()
    const right = this._groundRight()

    this.camera.position.addScaledVector(right, -deltaX * unitsPerPixel)

    if (vertical) {
      this.camera.position.z += deltaY * unitsPerPixel
    } else {
      this.camera.position.addScaledVector(this._groundForward(), deltaY * unitsPerPixel)
    }
  }
  _moveCamera(velocity) {
    let maxSpeed = this.moveSpeed
    if (this._keyState.press & SPRINT) {
      maxSpeed *= this.sprintMultiplier
    }

    velocity.multiplyScalar(this.friction)
    velocity.clampLength(0, maxSpeed)
    this.camera.position.add(velocity)
  }
  mapKey(key, action) {
    this.keyMapping = Object.assign({}, this.keyMapping, { [key]: action })
  }
}

export default SpectatorControls
