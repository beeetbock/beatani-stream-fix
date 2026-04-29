// Loose-typed Supabase client wrapper.
// Keeps the auto-generated client untouched while allowing legacy code
// (admin panels, analytics, etc.) that references tables not yet present
// in the current Lovable Cloud schema to type-check.
import { supabase as _supabase } from "./client";

export const supabase: any = _supabase as any;
export const isSupabaseConfigured = true;