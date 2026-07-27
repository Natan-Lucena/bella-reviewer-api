import bcrypt from "bcryptjs";

import { failure, Result, success } from "../../../../shared/core/result";
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

export type LoginUserError = "invalid_credentials";

export class LoginUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  // Same error for "email not found" and "wrong password" — never let the
  // response reveal whether an email is registered.
  async execute(params: LoginUserParams): Promise<Result<LoginUserResult, LoginUserError>> {
    const user = await this.userRepository.findByEmail(params.email);
    if (!user) {
      return failure("invalid_credentials");
    }

    const passwordMatches = await bcrypt.compare(params.password, user.passwordHash);
    if (!passwordMatches) {
      return failure("invalid_credentials");
    }

    const token = signSessionToken({ userId: user.id.value, email: user.email });

    return success({ id: user.id.value, email: user.email, token });
  }
}
