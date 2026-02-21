import type { PublicKey } from "@solana/web3.js";

import type { Role, RoleAccountData } from "../types";

export class RoleManager {
  async grant(_target: PublicKey, _role: Role | Role[], _options?: { mintQuota?: bigint }): Promise<string> {
    throw new Error("Not implemented");
  }

  async revoke(_target: PublicKey, _role: Role | Role[]): Promise<string> {
    throw new Error("Not implemented");
  }

  async getRole(_target: PublicKey): Promise<RoleAccountData | null> {
    throw new Error("Not implemented");
  }

  async listAll(): Promise<RoleAccountData[]> {
    throw new Error("Not implemented");
  }

  async transferAuthority(_newAuthority: PublicKey): Promise<string> {
    throw new Error("Not implemented");
  }
}
