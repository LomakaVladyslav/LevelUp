import { create } from 'zustand';
export const useDataRevision = create<{ revision: number }>(() => ({ revision: 0 }));
export const invalidateData = () => useDataRevision.setState((state) => ({ revision: state.revision + 1 }));

