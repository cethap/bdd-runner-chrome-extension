export type SelectorStrategy =
    | "testid"
    | "data-test"
    | "id"
    | "role-name"
    | "label"
    | "placeholder"
    | "alt"
    | "text"
    | "title"
    | "name"
    | "role-only"
    | "tag"
    | "tag-class"
    | "css-path";

export interface SelectorCandidate {
    selector: string;
    score: number; // lower = better
    strategy: SelectorStrategy;
}

export interface A11yInfo {
    role: string | null;
    name: string;
}

export type RoleTagMap = Record<string, string[]>;
