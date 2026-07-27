import { UserRepositoryImpl } from "../../../infraestructure/UserRepositoryImpl";
import { GetCurrentUserUseCase } from "../../use-cases/get-current-user/get-current-user-use-case";
import { LoginUserUseCase } from "../../use-cases/login-user/login-user-use-case";
import { SignupUserUseCase } from "../../use-cases/signup-user/signup-user-use-case";

// Central place that decides which concrete repository implementation each
// use case gets. See ../../../../../arquitetura.md — as more use cases are
// added (repos, credentials, review runs, ...), their make*UseCase()
// methods land here too, instead of one factory file per feature.
export class UseCaseFactory {
  private readonly userRepository = new UserRepositoryImpl();

  makeSignupUserUseCase(): SignupUserUseCase {
    return new SignupUserUseCase(this.userRepository);
  }

  makeLoginUserUseCase(): LoginUserUseCase {
    return new LoginUserUseCase(this.userRepository);
  }

  makeGetCurrentUserUseCase(): GetCurrentUserUseCase {
    return new GetCurrentUserUseCase(this.userRepository);
  }
}
