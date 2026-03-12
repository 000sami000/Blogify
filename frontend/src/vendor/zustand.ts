import { useSyncExternalStore } from "react";

type SetStateAction<T> = T | Partial<T> | ((state: T) => T | Partial<T>);
type Listener = () => void;

export interface StoreApi<T> {
  setState: (partial: SetStateAction<T>, replace?: boolean) => void;
  getState: () => T;
  subscribe: (listener: Listener) => () => void;
}

export type StateCreator<T> = (
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
  api: StoreApi<T>
) => T;

export type UseBoundStore<T> = {
  (): T;
  <U>(selector: (state: T) => U): U;
} & StoreApi<T>;

const identity = <T,>(value: T) => value;

export const create = <T>(initializer: StateCreator<T>): UseBoundStore<T> => {
  let state: T;
  const listeners = new Set<Listener>();

  const api: StoreApi<T> = {
    setState: (partial, replace = false) => {
      const nextState =
        typeof partial === "function" ? (partial as (current: T) => T | Partial<T>)(state) : partial;

      const shouldReplace = replace || typeof nextState !== "object" || nextState === null;
      const computed = shouldReplace
        ? (nextState as T)
        : ({
            ...state,
            ...(nextState as Partial<T>),
          } as T);

      if (Object.is(computed, state)) {
        return;
      }

      state = computed;
      listeners.forEach((listener) => listener());
    },
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  state = initializer(api.setState, api.getState, api);

  const useBoundStore = ((selector?: (snapshot: T) => unknown) =>
    useSyncExternalStore(
      api.subscribe,
      () => (selector ? selector(api.getState()) : api.getState()),
      () => (selector ? selector(api.getState()) : api.getState())
    )) as UseBoundStore<T>;

  useBoundStore.setState = api.setState;
  useBoundStore.getState = api.getState;
  useBoundStore.subscribe = api.subscribe;

  return useBoundStore;
};

export const createStore = create;
export const shallow = identity;
