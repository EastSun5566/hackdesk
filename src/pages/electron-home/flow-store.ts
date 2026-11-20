/** A flow's next steps from where it stands: the events to record and the commands to run. */
export type FlowPlan<Event, Command> = { events: Event[]; commands: Command[] };

export type FlowStore<State, Event, World, Command> = {
  getState: () => State;
  subscribe: (listener: () => void) => () => void;
  dispatch: (event: Event) => void;
  /**
   * Plans from the current state, records the plan's events at once and returns its commands.
   * Recording before the commands run means a second call finds the steps already taken and
   * repeats none of them: the driver can run again before React has rendered a step, when a
   * command's own update renders first (TanStack Query's mutation state renders synchronously) or
   * when React runs a new effect twice in development.
   */
  advance: (world: World) => Command[];
};

/**
 * Holds a flow's state outside React: a pure reducer for its events and a pure plan for what to
 * do next, so every transition is a table test and the component only runs the commands.
 */
export function createFlowStore<State, Event, World, Command>(
  initial: State,
  reducer: (state: State, event: Event) => State,
  plan: (state: State, world: World) => FlowPlan<Event, Command>,
): FlowStore<State, Event, World, Command> {
  let state = initial;
  const listeners = new Set<() => void>();
  const dispatch = (event: Event) => {
    const next = reducer(state, event);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispatch,
    advance: (world) => {
      const { events, commands } = plan(state, world);
      for (const event of events) dispatch(event);
      return commands;
    },
  };
}
