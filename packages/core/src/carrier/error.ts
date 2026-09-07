/** A carrier input the caller has to fix: bad GTIN, non-https base, over-long key. DE/EN. */
export class CarrierInputError extends Error {
  readonly text: { de: string; en: string };
  constructor(text: { de: string; en: string }) {
    super(text.en);
    this.name = 'CarrierInputError';
    this.text = text;
  }
}
