import { Uuid } from "../../../shared/core/uuid";

export type CredentialType = "llm" | "scm" | "action_token" | "webhook_secret";
export type CredentialProvider = "gemini" | "github";

export type CreateLlmCredentialProps = {
  repoId: string;
  encryptedSecret: string;
};

export type CreateScmCredentialProps = {
  repoId: string;
  encryptedSecret: string;
};

export type CreateWebhookSecretCredentialProps = {
  repoId: string;
  encryptedSecret: string;
};

export type CreateActionTokenCredentialProps = {
  repoId: string;
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

  // Reversible encryption — the Gemini API key.
  static createLlm(props: CreateLlmCredentialProps): Credential {
    const now = new Date();
    return new Credential(
      Uuid.random(),
      props.repoId,
      "llm",
      "gemini",
      props.encryptedSecret,
      null,
      null,
      null,
      now,
      now,
    );
  }

  // Reversible encryption — the GitHub PAT.
  static createScm(props: CreateScmCredentialProps): Credential {
    const now = new Date();
    return new Credential(
      Uuid.random(),
      props.repoId,
      "scm",
      "github",
      props.encryptedSecret,
      null,
      null,
      null,
      now,
      now,
    );
  }

  // Reversible encryption — needs to come back in plaintext at runtime to
  // recompute the webhook's HMAC signature.
  static createWebhookSecret(props: CreateWebhookSecretCredentialProps): Credential {
    const now = new Date();
    return new Credential(
      Uuid.random(),
      props.repoId,
      "webhook_secret",
      "github",
      props.encryptedSecret,
      null,
      null,
      null,
      now,
      now,
    );
  }

  // Irreversible hash — the BELLA_TOKEN, authenticated by comparison, never
  // decrypted back to plaintext.
  static createActionToken(props: CreateActionTokenCredentialProps): Credential {
    const now = new Date();
    return new Credential(
      Uuid.random(),
      props.repoId,
      "action_token",
      "github",
      null,
      props.secretHash,
      null,
      null,
      now,
      now,
    );
  }

  // Replaces the encrypted secret in place (same id/createdAt, new
  // updatedAt) instead of creating a second row for the same repo+type.
  // scopes/lastValidatedAt describe the secret being replaced, not the new
  // one, so they reset to null rather than carrying over.
  rotateSecret(encryptedSecret: string): Credential {
    return new Credential(
      this.id,
      this.repoId,
      this.type,
      this.provider,
      encryptedSecret,
      null,
      null,
      null,
      this.createdAt,
      new Date(),
    );
  }

  // Replaces the hash in place (same id/createdAt, new updatedAt) instead of
  // creating a second row for the same repo+type — the old hash stops
  // matching anything immediately, which is what invalidates the previous
  // action_token.
  rotateHash(secretHash: string): Credential {
    return new Credential(
      this.id,
      this.repoId,
      this.type,
      this.provider,
      null,
      secretHash,
      null,
      null,
      this.createdAt,
      new Date(),
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
      updatedAt: this.updatedAt,
    };
  }
}
