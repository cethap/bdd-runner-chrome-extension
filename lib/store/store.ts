type Listener<T> = (state: T) => void;

export class Store<T extends object> {
  private state: T;
  private listeners: Set<Listener<T>> = new Set();

  constructor(initialState: T) {
    this.state = { ...initialState };
  }

  getState(): Readonly<T> {
    return this.state;
  }

  setState(partial: Partial<T>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
