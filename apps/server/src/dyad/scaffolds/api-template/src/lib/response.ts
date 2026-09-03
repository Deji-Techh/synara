import { z } from "zod";

export const successResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    data,
    error: z.null(),
    requestId: z.string(),
  });

export const errorResponseSchema = z.object({
  data: z.null(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
  requestId: z.string(),
});

export function success<T>(data: T, requestId: string) {
  return { data, error: null, requestId };
}

export function error(code: string, message: string, requestId: string) {
  return { data: null, error: { code, message }, requestId };
}
