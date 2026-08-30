export type LoginActionState = {
  status: "idle" | "error";
  message: string | null;
  email: string;
  fieldErrors: {
    email?: string;
    password?: string;
  };
};

export const INITIAL_LOGIN_ACTION_STATE: LoginActionState = {
  status: "idle",
  message: null,
  email: "",
  fieldErrors: {},
};