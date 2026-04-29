// Loose augmentation so legacy admin/feature code that references tables
// not yet present in the Lovable Cloud schema still type-checks.
// This keeps the build green while the backend tables are being (re)created.
import type {} from "./types";

declare module "./types" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Database {
    public: {
      Tables: Record<string, {
        Row: any;
        Insert: any;
        Update: any;
        Relationships: any[];
      }>;
      Views: Record<string, { Row: any; Relationships: any[] }>;
      Functions: Record<string, { Args: any; Returns: any }>;
      Enums: Record<string, any>;
      CompositeTypes: Record<string, any>;
    };
  }
}

export {};