import { err, ok, Result } from "../../../../shared/core/result";
import { UseCaseError } from "../../../../shared/core/use-case-error";
import { User } from "../../../domain/entities/user.entity";
import { UserRepository } from "../../../domain/repository/user.repository";

export async function getCurrentUser(
  userId: string,
  deps: { userRepository: UserRepository },
): Promise<Result<User, UseCaseError>> {
  const user = await deps.userRepository.findById(userId);
  if (!user) {
    return err(
      new UseCaseError("not_authenticated", "Session refers to a user that no longer exists"),
    );
  }
  return ok(user);
}
