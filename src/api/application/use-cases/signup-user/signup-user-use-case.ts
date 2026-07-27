import bcrypt from "bcryptjs";

import { failure, Result, success } from "../../../../shared/core/result";
import { User } from "../../../domain/entities/user.entity";
import { UserRepository } from "../../../domain/repository/user.repository";

const BCRYPT_ROUNDS = 12;

export type SignupUserParams = {
  email: string;
  password: string;
};

export type SignupUserError = "email_already_registered";

export class SignupUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(params: SignupUserParams): Promise<Result<User, SignupUserError>> {
    const existing = await this.userRepository.findByEmail(params.email);
    if (existing) {
      return failure("email_already_registered");
    }

    const passwordHash = await bcrypt.hash(params.password, BCRYPT_ROUNDS);
    const user = User.create({ email: params.email, passwordHash });
    await this.userRepository.save(user);

    return success(user);
  }
}
