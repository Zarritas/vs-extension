import * as vscode from 'vscode';
import { GextiaProjectProfile } from '../types';

export class ProfileManager {
    private profiles: Map<string, GextiaProjectProfile> = new Map();
    private currentProfile: GextiaProjectProfile | null = null;

    constructor() {
        this.loadProfiles();
    }

    public getProfiles(): Map<string, GextiaProjectProfile> {
        return this.profiles;
    }

    public getCurrentProfile(): GextiaProjectProfile | null {
        return this.currentProfile;
    }

    public async setCurrentProfile(profileName: string): Promise<void> {
        const profile = this.profiles.get(profileName);
        if (profile) {
            this.currentProfile = profile;
            const config = vscode.workspace.getConfiguration('gextia-dev-helper');
            await config.update('currentProfile', profileName, vscode.ConfigurationTarget.Global);
            await config.update('gextiaVersion', profile.gextiaVersion, vscode.ConfigurationTarget.Workspace);
        }
    }

    public loadProfiles(): void {
        const config = vscode.workspace.getConfiguration('gextia-dev-helper');
        const savedProfiles = config.get<any>('profiles', {});
        const currentProfileName = config.get<string>('currentProfile', '');
        this.profiles.clear();
        for (const [name, profile] of Object.entries(savedProfiles)) {
            this.profiles.set(name, profile as GextiaProjectProfile);
        }
        if (currentProfileName && this.profiles.has(currentProfileName)) {
            this.currentProfile = this.profiles.get(currentProfileName) || null;
        }
    }

    public async saveProfiles(): Promise<void> {
        const config = vscode.workspace.getConfiguration('gextia-dev-helper');
        const profilesObj: any = {};
        this.profiles.forEach((profile, name) => {
            profilesObj[name] = profile;
        });
        await config.update('profiles', profilesObj, vscode.ConfigurationTarget.Global);
    }

    public hasActiveProfile(): boolean {
        return this.currentProfile !== null;
    }

    public async deleteProfile(profileName: string): Promise<void> {
        if (this.currentProfile?.name === profileName) {
            this.currentProfile = null;
        }
        this.profiles.delete(profileName);
        await this.saveProfiles();
    }

    public async createProfile(profile: GextiaProjectProfile): Promise<void> {
        this.profiles.set(profile.name, profile);
        await this.saveProfiles();
        await this.setCurrentProfile(profile.name);
    }

    public getProfileNames(): string[] {
        return Array.from(this.profiles.keys());
    }
}
