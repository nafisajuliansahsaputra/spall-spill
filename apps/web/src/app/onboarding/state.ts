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