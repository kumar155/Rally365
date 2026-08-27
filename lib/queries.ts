import { supabase } from "./supabase";

/** Selects `columns` from a group-scoped table, ordered by `orderColumn`. */
export const groupSelect = (
  groupId: string,
  table: string,
  columns: string,
  orderColumn: string,
  ascending = false
) => supabase.from(table).select(columns).eq("group_id", groupId).order(orderColumn, { ascending });
