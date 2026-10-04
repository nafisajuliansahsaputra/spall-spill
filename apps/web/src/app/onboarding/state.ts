export type HandleActionState = {
  status: "idle" | "error";
  message: string | null;
  handle: string;
  fieldErrors: {
    handle?: string;
  };
};

export type PrimaryUseCaseActionState = {
  status: "idle" | "error";
  message: string | null;
  primaryUseCase: string;
  fieldErrors: {
    primaryUseCase?: string;
  };
};

export type BasicIdentityActionState = {
  status: "idle" | "error";
  message: string | null;
  displayName: string;
  bio: string;
  profileAssetKey: string | null;
  fieldErrors: {
    displayName?: string;
    bio?: string;
    profileMedia?: string;
  };
};

export type StarterCompositionActionState = {
  status: "idle" | "error";
  message: string | null;
  starterKey: string;
  fieldErrors: {
    starterKey?: string;
  };
};
export type RelevantFirstJobActionState = {
  status: "idle" | "error";
  message: string | null;
};
export type IdentityConnectionActionState = {
  status: "idle" | "error";
  message: string | null;
  connectionKind:
    | "social"
    | "generic_link";
  socialPlatform: string;
  destinationUrl: string;
  fieldErrors: {
    connectionKind?: string;
    socialPlatform?: string;
    destinationUrl?: string;
  };
};
export type ProductDraftActionState = {
  status: "idle" | "error";
  message: string | null;
  sourceUrl: string;
  title: string;
  fieldErrors: {
    sourceUrl?: string;
    title?: string;
  };
};
