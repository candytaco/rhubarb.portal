// The numpy operations used by gallantlab/DemoFiles, on plain and typed arrays.

export type NumberArray = ArrayLike<number>

/**
 * numpy.interp: linear interpolation of x over increasing sample points xp with values fp,
 * clamped to the first and last value outside the sample range
 */
export function interp(x: number, xp: NumberArray, fp: NumberArray): number {
  const count = xp.length
  if (count === 0) return NaN
  if (x <= xp[0]) return fp[0]
  if (x >= xp[count - 1]) return fp[count - 1]
  // binary search for the last sample point <= x
  let low = 0
  let high = count - 1
  while (high - low > 1) {
    const middle = (low + high) >>> 1
    if (xp[middle] <= x) {
      low = middle
    } else {
      high = middle
    }
  }
  const span = xp[high] - xp[low]
  if (span === 0) return fp[low]
  return fp[low] + ((x - xp[low]) / span) * (fp[high] - fp[low])
}

export function interpArray(xs: NumberArray, xp: NumberArray, fp: NumberArray): Float64Array {
  const result = new Float64Array(xs.length)
  for (let index = 0; index < xs.length; index++) {
    result[index] = interp(xs[index], xp, fp)
  }
  return result
}

/**
 * numpy.unique with return_index and return_inverse: sorted unique values, the index of the first
 * occurrence of each in the input, and for each input element the index of its unique value
 */
export function unique(values: NumberArray): {
  values: Float64Array
  firstIndices: Int32Array
  inverse: Int32Array
} {
  const order = argsortStable(values)
  const uniqueValues: number[] = []
  const firstIndices: number[] = []
  const inverse = new Int32Array(values.length)
  for (let position = 0; position < order.length; position++) {
    const index = order[position]
    const value = values[index]
    if (uniqueValues.length === 0 || uniqueValues[uniqueValues.length - 1] !== value) {
      uniqueValues.push(value)
      firstIndices.push(index)
    } else if (index < firstIndices[firstIndices.length - 1]) {
      firstIndices[firstIndices.length - 1] = index
    }
    inverse[index] = uniqueValues.length - 1
  }
  return {
    values: Float64Array.from(uniqueValues),
    firstIndices: Int32Array.from(firstIndices),
    inverse,
  }
}

/** numpy.searchsorted on a sorted array */
export function searchsorted(
  sorted: NumberArray,
  value: number,
  side: 'left' | 'right' = 'left'
): number {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const middle = (low + high) >>> 1
    const goRight = side === 'left' ? sorted[middle] < value : sorted[middle] <= value
    if (goRight) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

/** numpy.median; NaN for an empty input */
export function median(values: NumberArray): number {
  if (values.length === 0) return NaN
  const sorted = Float64Array.from(values).sort()
  const middle = sorted.length >>> 1
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

/** numpy.diff */
export function diff(values: NumberArray): Float64Array {
  const result = new Float64Array(Math.max(values.length - 1, 0))
  for (let index = 1; index < values.length; index++) {
    result[index - 1] = values[index] - values[index - 1]
  }
  return result
}

/** numpy.argsort with kind = 'stable' */
export function argsortStable(values: NumberArray): Int32Array {
  const order = new Int32Array(values.length)
  for (let index = 0; index < order.length; index++) order[index] = index
  return order.sort((left, right) => values[left] - values[right] || left - right)
}

/** numpy.arange for integers */
export function arange(start: number, stop: number): Int32Array {
  const length = Math.max(Math.ceil(stop - start), 0)
  const result = new Int32Array(length)
  for (let index = 0; index < length; index++) result[index] = start + index
  return result
}

export function minimum(values: NumberArray): number {
  let result = Infinity
  for (let index = 0; index < values.length; index++) {
    if (values[index] < result) result = values[index]
  }
  return result
}

export function maximum(values: NumberArray): number {
  let result = -Infinity
  for (let index = 0; index < values.length; index++) {
    if (values[index] > result) result = values[index]
  }
  return result
}

/** Row-major matrix of doubles */
export interface Matrix {
  rows: number
  columns: number
  data: Float64Array
}

export function createMatrix(rows: number, columns: number, fill: number = NaN): Matrix {
  const data = new Float64Array(rows * columns)
  if (fill !== 0) data.fill(fill)
  return { rows, columns, data }
}

export function matrixGet(matrix: Matrix, row: number, column: number): number {
  return matrix.data[row * matrix.columns + column]
}

export function matrixSet(matrix: Matrix, row: number, column: number, value: number): void {
  matrix.data[row * matrix.columns + column] = value
}

export function matrixColumn(matrix: Matrix, column: number): Float64Array {
  const result = new Float64Array(matrix.rows)
  for (let row = 0; row < matrix.rows; row++) {
    result[row] = matrix.data[row * matrix.columns + column]
  }
  return result
}

export function matrixFromRows(rows: number[][], columns: number): Matrix {
  const matrix = createMatrix(rows.length, columns)
  for (let row = 0; row < rows.length; row++) {
    for (let column = 0; column < columns; column++) {
      matrix.data[row * columns + column] = rows[row][column]
    }
  }
  return matrix
}

export function copyMatrix(matrix: Matrix): Matrix {
  return { rows: matrix.rows, columns: matrix.columns, data: Float64Array.from(matrix.data) }
}

/** Stacks matrices with the same column count vertically (numpy.vstack) */
export function vstack(matrices: Matrix[], columns: number): Matrix {
  const rows = matrices.reduce((total, matrix) => total + matrix.rows, 0)
  const result = createMatrix(rows, columns)
  let offset = 0
  for (const matrix of matrices) {
    result.data.set(matrix.data, offset)
    offset += matrix.data.length
  }
  return result
}
