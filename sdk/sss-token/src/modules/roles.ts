import type { Connection } from "@solana/web3.js";
import { Keypair, PublicKey } from "@solana/web3.js";

import { Role } from "../types";
import type { RoleAccountData } from "../types";
import {
  buildTransferAuthorityInstruction,
  buildUpdateMinterInstruction,
  buildUpdateRolesInstruction,
} from "../instructions";
import {
  decodeRoleAccount,
  findRoleAccountPda,
  sendInstructions,
  STABLECOIN_CORE_PROGRAM_ID,
} from "../utils";

interface RoleManagerContext {
  connection: Connection;
  configPda: PublicKey;
  authority?: Keypair;
  programId?: PublicKey;
}

function toRoleMask(role: Role | Role[]): number {
  if (Array.isArray(role)) {
    return role.reduce((acc, current) => acc | current, 0);
  }
  return role;
}

export class RoleManager {
  private readonly connection: Connection;
  private readonly configPda: PublicKey;
  private readonly authority?: Keypair;
  private readonly programId: PublicKey;

  constructor(context: RoleManagerContext) {
    this.connection = context.connection;
    this.configPda = context.configPda;
    this.authority = context.authority;
    this.programId = context.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  }

  private requireAuthority(): Keypair {
    if (!this.authority) {
      throw new Error("Missing authority keypair");
    }
    return this.authority;
  }

  async grant(
    target: PublicKey,
    role: Role | Role[],
    options?: { mintQuota?: bigint },
  ): Promise<string> {
    const authority = this.requireAuthority();
    const current = await this.getRole(target);
    const roleMask = toRoleMask(role);
    const nextRoles = (current?.roles ?? 0) | roleMask;
    const mintQuota =
      (nextRoles & Role.MINTER) !== 0
        ? options?.mintQuota ?? current?.mintQuota ?? null
        : null;

    const instruction = buildUpdateRolesInstruction({
      authority: authority.publicKey,
      configPda: this.configPda,
      target,
      roles: nextRoles,
      mintQuota,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [authority]);
  }

  async revoke(target: PublicKey, role: Role | Role[]): Promise<string> {
    const authority = this.requireAuthority();
    const current = await this.getRole(target);
    if (!current) {
      throw new Error("Target role account not found");
    }
    const roleMask = toRoleMask(role);
    const nextRoles = current.roles & ~roleMask;
    const mintQuota =
      (nextRoles & Role.MINTER) !== 0 ? current.mintQuota ?? null : null;

    const instruction = buildUpdateRolesInstruction({
      authority: authority.publicKey,
      configPda: this.configPda,
      target,
      roles: nextRoles,
      mintQuota,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [authority]);
  }

  async updateMinter(target: PublicKey, newQuota: bigint): Promise<string> {
    const authority = this.requireAuthority();
    const targetRoleAccount = findRoleAccountPda(
      this.configPda,
      target,
      this.programId,
    )[0];

    const instruction = buildUpdateMinterInstruction({
      authority: authority.publicKey,
      configPda: this.configPda,
      targetRoleAccount,
      newQuota,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [authority]);
  }

  async getRole(target: PublicKey): Promise<RoleAccountData | null> {
    const rolePda = findRoleAccountPda(this.configPda, target, this.programId)[0];
    const accountInfo = await this.connection.getAccountInfo(rolePda);
    if (!accountInfo) {
      return null;
    }
    const decoded = decodeRoleAccount(accountInfo.data);
    return {
      authority: decoded.authority,
      roles: decoded.roles,
      mintQuota: decoded.mintQuota ?? undefined,
    };
  }

  async listAll(): Promise<RoleAccountData[]> {
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [
        {
          memcmp: {
            offset: 8,
            bytes: this.configPda.toBase58(),
          },
        },
      ],
    });

    const roles: RoleAccountData[] = [];
    for (const account of accounts) {
      try {
        const decoded = decodeRoleAccount(account.account.data);
        roles.push({
          authority: decoded.authority,
          roles: decoded.roles,
          mintQuota: decoded.mintQuota ?? undefined,
        });
      } catch {
        continue;
      }
    }
    return roles;
  }

  async transferAuthority(newAuthority: PublicKey): Promise<string> {
    const authority = this.requireAuthority();
    const instruction = buildTransferAuthorityInstruction({
      currentAuthority: authority.publicKey,
      configPda: this.configPda,
      newAuthority,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [authority]);
  }
}
