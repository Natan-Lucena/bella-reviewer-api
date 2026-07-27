import { failure, Result, success } from "../../../../shared/core/result";
import { User } from "../../../domain/entities/user.entity";
import { UserRepository } from "../../../domain/repository/user.repository";

export type GetCurrentUserError = "not_authenticated";

export class GetCurrentUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(userId: string): Promise<Result<User, GetCurrentUserError>> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return failure("not_authenticated");
    }
    return success(user);
  }
}
