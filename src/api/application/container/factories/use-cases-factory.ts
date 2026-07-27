import { RepoConfigRepositoryImpl } from "../../../infraestructure/RepoConfigRepositoryImpl";
import { RepoRepositoryImpl } from "../../../infraestructure/RepoRepositoryImpl";
import { UserRepositoryImpl } from "../../../infraestructure/UserRepositoryImpl";
import { CreateRepoUseCase } from "../../use-cases/create-repo/create-repo-use-case";
import { GetCurrentUserUseCase } from "../../use-cases/get-current-user/get-current-user-use-case";
import { LoginUserUseCase } from "../../use-cases/login-user/login-user-use-case";
import { SignupUserUseCase } from "../../use-cases/signup-user/signup-user-use-case";
import { UpdateRepoConfigUseCase } from "../../use-cases/update-repo-config/update-repo-config-use-case";

// Central place that decides which concrete repository implementation each
// use case gets. See ../../../../../arquitetura.md — as more use cases are
// added (credentials, review runs, ...), their make*UseCase() methods land
// here too, instead of one factory file per feature.
export class UseCaseFactory {
  private readonly userRepository = new UserRepositoryImpl();
  private readonly repoRepository = new RepoRepositoryImpl();
  private readonly repoConfigRepository = new RepoConfigRepositoryImpl();

  makeSignupUserUseCase(): SignupUserUseCase {
    return new SignupUserUseCase(this.userRepository);
  }

  makeLoginUserUseCase(): LoginUserUseCase {
    return new LoginUserUseCase(this.userRepository);
  }

  makeGetCurrentUserUseCase(): GetCurrentUserUseCase {
    return new GetCurrentUserUseCase(this.userRepository);
  }

  makeCreateRepoUseCase(): CreateRepoUseCase {
    return new CreateRepoUseCase(this.repoRepository, this.repoConfigRepository);
  }

  makeUpdateRepoConfigUseCase(): UpdateRepoConfigUseCase {
    return new UpdateRepoConfigUseCase(this.repoRepository, this.repoConfigRepository);
  }
}
