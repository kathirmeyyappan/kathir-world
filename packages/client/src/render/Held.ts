// Something drawn that's fetched while it's wanted and can be let go again: a floor of rooms
// (Interiors.ts), a landmark's model drawn in full near and as a shell far off (Shells.ts). Whoever
// keeps it says when it's wanted, when to let it go and whether it's to be drawn; this keeps where
// it has got to, so a want while it's on its way or a let-go before it's here does nothing.
export interface Part {
  // Fetches and builds it, begun whenever it's wanted and isn't here; none for a part that's there
  // from the start.
  load?: () => Promise<void>;
  // Lets all of it go again; none for a part that's never let go.
  unload?: () => void;
  // Whether to draw it, told once it's here and whenever that changes.
  show: (on: boolean) => void;
}

export type Status = 'gone' | 'loading' | 'here';

export class Held {
  status: Status;
  private shown = false;

  constructor(
    private readonly part: Part,
    private readonly name: string, // for the console, if a load fails
  ) {
    this.status = part.load ? 'gone' : 'here';
  }

  get canLetGo(): boolean {
    return this.status === 'here' && !!this.part.unload;
  }

  want(): void {
    if (this.status !== 'gone') return;
    this.status = 'loading';
    this.part.load!()
      .then(() => {
        this.status = 'here';
        this.part.show(this.shown);
      })
      .catch((e: unknown) => {
        this.status = 'gone'; // tried again the next time it's wanted
        console.error(`loading ${this.name}`, e);
      });
  }

  letGo(): void {
    if (!this.canLetGo) return;
    this.part.show(false);
    this.part.unload!();
    this.status = 'gone';
  }

  show(on: boolean): void {
    this.shown = on;
    if (this.status === 'here') this.part.show(on);
  }
}
