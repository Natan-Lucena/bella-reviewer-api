import { Uuid } from "../../../shared/core/uuid";

export type CredentialType = "llm" | "scm" | "action_token" | "webhook_secret";
export type CredentialProvider = "gemini" | "github";

export type CreateEncryptedCredentialProps = {
  repoId: string;
  type: "llm" | "scm" | "webhook_secret";
  provider: CredentialProvider;
  encryptedSecret: string;
};

export type CreateHashedCredentialProps = {
  repoId: string;
  type: "action_token";
  provider: CredentialProvider;
  secretHash: string;
};

export class Credential {
  private constructor(
    public readonly id: Uuid,
    public readonly repoId: string,
    public readonly type: CredentialType,
    public readonly provider: CredentialProvider,
    public readonly encryptedSecret: string | null,
    public readonly secretHash: string | null,
    public readonly scopes: string | null,
    public readonly lastValidatedAt: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  // type=llm / type=scm / type=webhook_secret — reversible encryption.
  static createEncrypted(props: CreateEncryptedCredentialProps): Credential {
    const now = new Date();
    return new Credential(
      Uuid.random(),
      props.repoId,
      props.type,
      props.provider,
      props.encryptedSecret,
      null,
      null,
      null,
      now,
      now,
    );
  }

  // type=action_token — irreversible hash.
  static createHashed(props: CreateHashedCredentialProps): Credential {
    const now = new Date();
    return new Credential(
      Uuid.random(),
      props.repoId,
      "action_token",
      props.provider,
      null,
      props.secretHash,
      null,
      null,
      now,
      now,
    );
  }

  static fromPersistence(props: {
    id: string;
    repoId: string;
    type: CredentialType;
    provider: CredentialProvider;
    encryptedSecret: string | null;
    secretHash: string | null;
    scopes: string | null;
    lastValidatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Credential {
    return new Credential(
      new Uuid(props.id),
      props.repoId,
      props.type,
      props.provider,
      props.encryptedSecret,
      props.secretHash,
      props.scopes,
      props.lastValidatedAt,
      props.createdAt,
      props.updatedAt,
    );
  }

  toJSON() {
    // Never includes encryptedSecret or secretHash — only whether it's
    // configured.
    return {
      type: this.type,
      provider: this.provider,
      configured: true,
      lastValidatedAt: this.lastValidatedAt,
    };
  }
}
