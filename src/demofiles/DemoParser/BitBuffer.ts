// Port of gallantlab/DemoFiles DemoParser/BitBuffer.py.
//
// Bits are read least significant bit first within each byte and multi-bit fields are
// little-endian, which is the bit order the Source engine uses for its bit-packed payloads.

export class BitBufferError extends Error {}

const textDecoder = new TextDecoder('utf-8')
const floatScratch = new DataView(new ArrayBuffer(8))

// 2^i for i in 0..64, so that 32-bit reads never go through signed JS bit arithmetic
const POW2: number[] = []
for (let i = 0; i <= 64; i++) POW2.push(2 ** i)

export type Vector3Tuple = [number, number, number]

/**
 * Number of bits needed to represent a non-negative integer (Python int.bit_length)
 */
export function bitLength(value: number): number {
  if (value <= 0) return 0
  return 32 - Math.clz32(value)
}

export class BitBuffer {
  readonly rawData: Uint8Array
  readonly bitStart: number
  readonly bitEnd: number
  bitPosition: number

  /**
   * @param data       raw data to be parsed
   * @param bitOffset  bit position in data at which this buffer starts
   * @param bitLength  number of bits this buffer covers, or undefined for the rest of data
   */
  constructor(data: Uint8Array, bitOffset: number = 0, bitLength?: number) {
    this.rawData = data
    this.bitStart = bitOffset
    this.bitPosition = bitOffset
    this.bitEnd = bitLength === undefined ? data.length * 8 : bitOffset + bitLength
  }

  /** A fresh buffer over the same range as another one, positioned at its start */
  static fromRange(other: BitBuffer): BitBuffer {
    return new BitBuffer(other.rawData, other.bitStart, other.bitLength)
  }

  get finished(): boolean {
    return this.bitPosition >= this.bitEnd
  }

  get bitsLeft(): number {
    return this.bitEnd - this.bitPosition
  }

  get bitLength(): number {
    return this.bitEnd - this.bitStart
  }

  get bitsRead(): number {
    return this.bitPosition - this.bitStart
  }

  reset(): void {
    this.bitPosition = this.bitStart
  }

  skipBits(count: number): void {
    if (this.bitPosition + count > this.bitEnd) {
      throw new BitBufferError(
        `Cannot skip ${count} bits at bit ${this.bitPosition}, ${this.bitsLeft} left`
      )
    }
    this.bitPosition += count
  }

  /**
   * Reads some bits as a little-endian integer
   * @param count   number of bits to read (at most 32)
   * @param signed  interpret the value as two's complement
   */
  readBits(count: number, signed: boolean = false): number {
    if (count === 0) return 0
    if (count > 32) {
      throw new BitBufferError(`Cannot read ${count} bits at once, use readULong for 64 bits`)
    }
    const end = this.bitPosition + count
    if (end > this.bitEnd) {
      throw new BitBufferError(
        `Cannot read ${count} bits at bit ${this.bitPosition}, ${this.bitsLeft} left`
      )
    }
    const data = this.rawData
    let position = this.bitPosition
    let value = 0
    let read = 0

    // fast path for byte aligned reads
    if ((position & 7) === 0 && (count & 7) === 0) {
      let byteIndex = position >>> 3
      while (read < count) {
        value += data[byteIndex] * POW2[read]
        byteIndex++
        read += 8
      }
    } else {
      while (read < count) {
        const byteIndex = position >>> 3
        const bitOffset = position & 7
        const take = Math.min(8 - bitOffset, count - read)
        const chunk = (data[byteIndex] >>> bitOffset) & ((1 << take) - 1)
        value += chunk * POW2[read]
        read += take
        position += take
      }
    }

    this.bitPosition = end
    if (signed && value >= POW2[count - 1]) {
      value -= POW2[count]
    }
    return value
  }

  readBit(): number {
    return this.readBits(1)
  }

  readBool(): boolean {
    return this.readBits(1) === 1
  }

  readByte(): number {
    return this.readBits(8)
  }

  readSignedByte(): number {
    return this.readBits(8, true)
  }

  readShort(): number {
    return this.readBits(16, true)
  }

  readUShort(): number {
    return this.readBits(16)
  }

  readInt(): number {
    return this.readBits(32, true)
  }

  readUInt(): number {
    return this.readBits(32)
  }

  /** Reads an unsigned 64-bit integer */
  readULong(): bigint {
    const low = this.readBits(32)
    const high = this.readBits(32)
    return (BigInt(high) << 32n) | BigInt(low)
  }

  readFloat(): number {
    floatScratch.setUint32(0, this.readBits(32), true)
    return floatScratch.getFloat32(0, true)
  }

  readChar(): string {
    return String.fromCharCode(this.readBits(8))
  }

  /** Reads a number of bytes (a copy) */
  readBytes(count: number): Uint8Array {
    if (count === 0) return new Uint8Array(0)
    if ((this.bitPosition & 7) === 0) {
      const end = this.bitPosition + count * 8
      if (end > this.bitEnd) {
        throw new BitBufferError(
          `Cannot read ${count} bytes at bit ${this.bitPosition}, ${this.bitsLeft} bits left`
        )
      }
      const start = this.bitPosition >>> 3
      this.bitPosition = end
      return this.rawData.slice(start, start + count)
    }
    const bytes = new Uint8Array(count)
    for (let index = 0; index < count; index++) {
      bytes[index] = this.readBits(8)
    }
    return bytes
  }

  /**
   * Reads a bit count into little-endian packed bytes (the equivalent of Python's
   * int.from_bits(...).to_bytes(ceil(bits / 8), 'little'))
   */
  readBitBytes(bitCount: number): Uint8Array {
    const bytes = new Uint8Array((bitCount + 7) >>> 3)
    let remaining = bitCount
    let index = 0
    while (remaining > 0) {
      const take = Math.min(8, remaining)
      bytes[index++] = this.readBits(take)
      remaining -= take
    }
    return bytes
  }

  /**
   * Reads a string, either null-terminated or of a fixed byte length in which the text ends
   * at the first null
   */
  readString(length?: number): string {
    if (length !== undefined) {
      let data = this.readBytes(length)
      const terminator = data.indexOf(0)
      if (terminator >= 0) data = data.subarray(0, terminator)
      return textDecoder.decode(data)
    }
    if ((this.bitPosition & 7) === 0) {
      const start = this.bitPosition >>> 3
      const end = this.bitEnd >>> 3
      let terminator = -1
      for (let index = start; index < end; index++) {
        if (this.rawData[index] === 0) {
          terminator = index
          break
        }
      }
      if (terminator < 0) {
        throw new BitBufferError(`Unterminated string at bit ${this.bitPosition}`)
      }
      this.bitPosition = (terminator + 1) * 8
      return textDecoder.decode(this.rawData.subarray(start, terminator))
    }
    const characters: number[] = []
    for (;;) {
      const byte = this.readBits(8)
      if (byte === 0) break
      characters.push(byte)
    }
    return textDecoder.decode(new Uint8Array(characters))
  }

  /** Returns a new buffer over the next bitCount bits and advances past them */
  readSubBuffer(bitCount: number): BitBuffer {
    if (this.bitPosition + bitCount > this.bitEnd) {
      throw new BitBufferError(
        `Cannot take ${bitCount} bits at bit ${this.bitPosition}, ${this.bitsLeft} left`
      )
    }
    const subBuffer = new BitBuffer(this.rawData, this.bitPosition, bitCount)
    this.bitPosition += bitCount
    return subBuffer
  }

  /**
   * Reads a bit-packed coordinate: two presence bits, a sign bit, a 14-bit integer part and a
   * 5-bit fraction
   */
  readCoord(): number {
    const hasInteger = this.readBool()
    const hasFraction = this.readBool()
    let value = 0
    if (hasInteger || hasFraction) {
      const sign = this.readBool()
      if (hasInteger) value += this.readBits(14) + 1
      if (hasFraction) value += this.readBits(5) / 32
      if (sign) value = -value
    }
    return value
  }

  /** Reads three gate bits followed by a coordinate for each present axis */
  readVectorCoord(): Vector3Tuple {
    const hasX = this.readBool()
    const hasY = this.readBool()
    const hasZ = this.readBool()
    const x = hasX ? this.readCoord() : 0
    const y = hasY ? this.readCoord() : 0
    const z = hasZ ? this.readCoord() : 0
    return [x, y, z]
  }

  /** Reads a normalised component: a sign bit and an 11-bit fraction over 2047 */
  readBitNormal(): number {
    const sign = this.readBool()
    const value = this.readBits(11) / 2047
    return sign ? -value : value
  }

  /** Reads an angle stored in a fixed number of bits over 360 degrees */
  readBitAngle(bitCount: number): number {
    return this.readBits(bitCount) * (360 / POW2[bitCount])
  }

  /** Variable-length unsigned integer: 4 bits, then a 2-bit selector for 0, 4, 8 or 28 more bits */
  readUBitInt(): number {
    let value = this.readBits(4)
    const selector = this.readBits(2)
    if (selector === 1) {
      value += this.readBits(4) * 16
    } else if (selector === 2) {
      value += this.readBits(8) * 16
    } else if (selector === 3) {
      value += this.readBits(28) * 16
    }
    return value
  }

  /** Old-engine variable-length unsigned integer: a 2-bit selector for 4, 8, 12 or 32 bits */
  readUBitVar(): number {
    const selector = this.readBits(2)
    if (selector === 0) return this.readBits(4)
    if (selector === 1) return this.readBits(8)
    if (selector === 2) return this.readBits(12)
    return this.readBits(32)
  }

  /**
   * Reads the next entity property index of a property list
   * @param lastIndex  previously read index, -1 at the start
   * @param newWay     whether the list uses the compact encoding
   * @returns next index, or -1 at the end of the list
   */
  readFieldIndex(lastIndex: number, newWay: boolean): number {
    if (newWay && this.readBool()) {
      return lastIndex + 1
    }
    let value: number
    if (newWay && this.readBool()) {
      value = this.readBits(3)
    } else {
      value = this.readBits(5)
      const selector = this.readBits(2)
      if (selector === 1) {
        value |= this.readBits(2) << 5
      } else if (selector === 2) {
        value |= this.readBits(4) << 5
      } else if (selector === 3) {
        value |= this.readBits(7) << 5
      }
    }
    if (value === 0xfff) return -1
    return lastIndex + 1 + value
  }

  readOptionalByte(): number | null {
    return this.readBool() ? this.readByte() : null
  }

  readOptionalUInt(): number | null {
    return this.readBool() ? this.readUInt() : null
  }

  readOptionalInt(): number | null {
    return this.readBool() ? this.readInt() : null
  }

  readOptionalFloat(): number | null {
    return this.readBool() ? this.readFloat() : null
  }

  readOptionalShort(): number | null {
    return this.readBool() ? this.readShort() : null
  }

  readOptionalUShort(): number | null {
    return this.readBool() ? this.readUShort() : null
  }

  readOptionalChar(): string | null {
    return this.readBool() ? this.readChar() : null
  }
}

/**
 * Byte-aligned little-endian reader over a whole demo file (the file object of the Python)
 */
export class ByteReader {
  readonly data: Uint8Array
  readonly view: DataView
  position: number = 0

  constructor(data: Uint8Array) {
    this.data = data
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  }

  get remaining(): number {
    return this.data.length - this.position
  }

  private ensure(count: number): void {
    if (this.position + count > this.data.length) {
      throw new BitBufferError(
        `Unexpected end of file: needed ${count} bytes at byte ${this.position}, ${this.remaining} left`
      )
    }
  }

  readUint8(): number {
    this.ensure(1)
    return this.data[this.position++]
  }

  readInt32(): number {
    this.ensure(4)
    const value = this.view.getInt32(this.position, true)
    this.position += 4
    return value
  }

  readFloat32(): number {
    this.ensure(4)
    const value = this.view.getFloat32(this.position, true)
    this.position += 4
    return value
  }

  /** A view (not a copy) of the next count bytes */
  readBytes(count: number): Uint8Array {
    this.ensure(count)
    const bytes = this.data.subarray(this.position, this.position + count)
    this.position += count
    return bytes
  }

  /** The rest of the file as a view */
  readRest(): Uint8Array {
    const bytes = this.data.subarray(this.position)
    this.position = this.data.length
    return bytes
  }

  /** Reads a null-padded string field of a fixed byte length */
  readFixedString(length: number): string {
    let bytes = this.readBytes(length)
    const terminator = bytes.indexOf(0)
    if (terminator >= 0) bytes = bytes.subarray(0, terminator)
    return textDecoder.decode(bytes)
  }
}
