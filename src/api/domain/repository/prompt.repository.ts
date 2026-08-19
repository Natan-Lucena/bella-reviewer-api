import { Prompt } from "../entities/prompt.entity";

export interface PromptRepository {
  save(prompt: Prompt): Promise<void>;
  findById(id: string): Promise<Prompt | null>;
  findByUserId(userId: string): Promise<Prompt[]>;
  findByUserIdAndName(userId: string, name: string): Promise<Prompt | null>;
  delete(id: string): Promise<void>;
}
