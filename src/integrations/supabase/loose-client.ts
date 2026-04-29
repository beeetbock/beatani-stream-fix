// Re-exports the auto-generated Supabase client but typed loosely as `any`,
// so legacy code that references tables/columns not yet present in the
// freshly provisioned Lovable Cloud schema continues to type-check.
// Runtime behaviour is identical to the underlying client.
import { supabase as _supabase } from "./client";

export const supabase: any = _supabase as any;
export { isSupabaseConfigured } from "./client-extras";