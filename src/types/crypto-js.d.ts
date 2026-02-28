declare module 'crypto-js/sha256' {
  interface HashOutput {
    toString(): string
  }

  export default function SHA256(input: unknown): HashOutput
}

declare module 'crypto-js' {
  interface WordArrayStatic {
    create(data: unknown): unknown
  }

  export const lib: {
    WordArray: WordArrayStatic
  }
}
