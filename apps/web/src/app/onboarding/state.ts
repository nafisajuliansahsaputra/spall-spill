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
  fieldErrors: {
    displayName?: string;
    bio?: string;
  };
};