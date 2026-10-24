// Prisma returns BigInt columns (ConsentEvent.seq) as native BigInt, which
// JSON.stringify refuses to serialise. Emit them as strings, matching the
// cursor format of the events API; strings also avoid precision loss in JS clients.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function () {
  return this.toString();
};

export {};
