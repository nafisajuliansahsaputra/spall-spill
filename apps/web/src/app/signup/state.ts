export type SignUpActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  email: string;
  fieldErrors: {
    email?: string;
    password?: string;
  };
};

export const INITIAL_SIGN_UP_ACTION_STATE: SignUpActionState = {
  status: "idle",
  message: null,
  email: "",
  fieldErrors: {},
};