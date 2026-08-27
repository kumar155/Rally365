/** Adds or removes `id`, ignoring additions once `max` entries are selected. */
export const toggleSelection = (selected: string[], id: string, max = Infinity) => {
  if (selected.includes(id)) return selected.filter(x => x !== id);
  return selected.length < max ? [...selected, id] : selected;
};
