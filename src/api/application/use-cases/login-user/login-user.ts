import bcrypt from "bcryptjs";

import { err, ok, Result } from "../../../../shared/core/result";
import { UseCaseError } from "../../../../shared/core/use-case-error";
import { signSessionToken } from "../../../../shared/infra/auth/session-token";
import { UserRepository } from "../../../domain/repository/user.repository";

export type LoginUserParams = {
  email: string;
  password: string;
};

export type LoginUserResult = {
  id: string;
  email: string;
  token: string;
};

// Same error for "email not found" and "wrong password" — never let the
// response reveal whether an email is registered. See
// backend-prds/02-auth-cadastro-login-sessao.md.
export async function loginUser(
  params: LoginUserParams,
  deps: { userRepository: UserRepository },
): Promise<Result<LoginUserResult, UseCaseError>> {
  const user = await deps.userRepository.findByEmail(params.email);
  if (!user) {
    return err(new UseCaseError("invalid_credentials", "Invalid email or password"));
  }

  const passwordMatches = await bcrypt.compare(params.password, user.passwordHash);
  if (!passwordMatches) {
    return err(new UseCaseError("invalid_credentials", "Invalid email or password"));
  }

  const token = signSessionToken({ userId: user.id.value, email: user.email });

  return ok({ id: user.id.value, email: user.email, token });
}
