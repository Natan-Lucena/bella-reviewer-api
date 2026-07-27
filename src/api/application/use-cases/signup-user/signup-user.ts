import bcrypt from "bcryptjs";

import { err, ok, Result } from "../../../../shared/core/result";
import { UseCaseError } from "../../../../shared/core/use-case-error";
import { User } from "../../../domain/entities/user.entity";
import { UserRepository } from "../../../domain/repository/user.repository";

const BCRYPT_ROUNDS = 12;

export type SignupUserParams = {
  email: string;
  password: string;
};

export async function signupUser(
  params: SignupUserParams,
  deps: { userRepository: UserRepository },
): Promise<Result<User, UseCaseError>> {
  const existing = await deps.userRepository.findByEmail(params.email);
  if (existing) {
    return err(new UseCaseError("email_already_registered", "This email is already registered"));
  }

  const passwordHash = await bcrypt.hash(params.password, BCRYPT_ROUNDS);
  const user = User.create({ email: params.email, passwordHash });
  await deps.userRepository.save(user);

  return ok(user);
}
