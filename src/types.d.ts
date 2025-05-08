// Declaraciones de tipos para módulos que no soportan tipado de TypeScript

declare module 'bip65' {
  export function encode(params: { blocks?: number; seconds?: number }): number;
  export function decode(locktime: number): { blocks: number; seconds: number };
}
declare module 'bip68' {
  export function encode(params: { blocks?: number; seconds?: number }): number;
  export function decode(value: number): { blocks: number; seconds: number };
}

declare module 'aria-query';
declare module 'entities/decode';