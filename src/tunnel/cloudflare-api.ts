/**
 * Cloudflare API Client
 * 
 * Handles tunnel and DNS operations via Cloudflare API.
 */

import { CloudflareCredentials } from './config';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

interface ApiResponse<T> {
    success: boolean;
    errors: Array<{ code: number; message: string }>;
    messages: string[];
    result: T;
}

interface ZoneInfo {
    id: string;
    name: string;
    status: string;
}

interface TunnelInfo {
    id: string;
    name: string;
    created_at: string;
    deleted_at: string | null;
    status: string;
}

interface TunnelToken {
    token: string;
}

interface DnsRecord {
    id: string;
    type: string;
    name: string;
    content: string;
    proxied: boolean;
}

/**
 * Make an authenticated request to the Cloudflare API
 */
async function cfFetch<T>(
    credentials: CloudflareCredentials,
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const url = `${CF_API_BASE}${endpoint}`;
    console.log(`[CF API] ${options.method || 'GET'} ${endpoint}`);
    
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${credentials.apiToken}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        const data = await response.json() as ApiResponse<T>;
        console.log(`[CF API] Response: ${response.status} success=${data.success}`);
        return data;
    } catch (e: any) {
        console.error(`[CF API] Error: ${e.message}`);
        throw e;
    }
}

/**
 * Test API credentials by fetching zone info
 */
export async function testCredentials(
    credentials: CloudflareCredentials
): Promise<{ success: boolean; message: string; zoneName?: string }> {
    try {
        // Verify zone access
        const zoneResponse = await cfFetch<ZoneInfo>(
            credentials,
            `/zones/${credentials.zoneId}`
        );

        if (!zoneResponse.success) {
            const errorMsg = zoneResponse.errors?.[0]?.message || 'Invalid Zone ID or insufficient permissions';
            return { success: false, message: errorMsg };
        }

        // Verify account access by listing tunnels
        const tunnelResponse = await cfFetch<TunnelInfo[]>(
            credentials,
            `/accounts/${credentials.accountId}/cfd_tunnel?is_deleted=false`
        );

        if (!tunnelResponse.success) {
            const errorMsg = tunnelResponse.errors?.[0]?.message || 'Invalid Account ID or insufficient permissions';
            return { success: false, message: errorMsg };
        }

        return {
            success: true,
            message: `Connected to domain: ${zoneResponse.result.name}`,
            zoneName: zoneResponse.result.name,
        };
    } catch (e: any) {
        return {
            success: false,
            message: `Connection error: ${e.message}`,
        };
    }
}

/**
 * Get zone name from zone ID
 */
export async function getZoneName(credentials: CloudflareCredentials): Promise<string | null> {
    try {
        const response = await cfFetch<ZoneInfo>(
            credentials,
            `/zones/${credentials.zoneId}`
        );
        return response.success ? response.result.name : null;
    } catch {
        return null;
    }
}

/**
 * List existing tunnels
 */
export async function listTunnels(
    credentials: CloudflareCredentials
): Promise<{ success: boolean; tunnels?: TunnelInfo[]; message?: string }> {
    try {
        const response = await cfFetch<TunnelInfo[]>(
            credentials,
            `/accounts/${credentials.accountId}/cfd_tunnel?is_deleted=false`
        );

        if (!response.success) {
            return {
                success: false,
                message: response.errors?.[0]?.message || 'Failed to list tunnels',
            };
        }

        return {
            success: true,
            tunnels: response.result,
        };
    } catch (e: any) {
        return {
            success: false,
            message: e.message,
        };
    }
}

/**
 * Create a new tunnel
 */
export async function createTunnel(
    credentials: CloudflareCredentials,
    name: string
): Promise<{ success: boolean; tunnelId?: string; message: string }> {
    try {
        // Generate a random secret for the tunnel
        const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');

        const response = await cfFetch<TunnelInfo>(
            credentials,
            `/accounts/${credentials.accountId}/cfd_tunnel`,
            {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    tunnel_secret: secret,
                    config_src: 'cloudflare',
                }),
            }
        );

        if (!response.success) {
            return {
                success: false,
                message: response.errors?.[0]?.message || 'Failed to create tunnel',
            };
        }

        return {
            success: true,
            tunnelId: response.result.id,
            message: `Tunnel "${name}" created successfully`,
        };
    } catch (e: any) {
        return {
            success: false,
            message: e.message,
        };
    }
}

/**
 * Get tunnel token for running the tunnel
 */
export async function getTunnelToken(
    credentials: CloudflareCredentials,
    tunnelId: string
): Promise<{ success: boolean; token?: string; message?: string }> {
    try {
        const response = await cfFetch<string>(
            credentials,
            `/accounts/${credentials.accountId}/cfd_tunnel/${tunnelId}/token`
        );

        if (!response.success) {
            return {
                success: false,
                message: response.errors?.[0]?.message || 'Failed to get tunnel token',
            };
        }

        return {
            success: true,
            token: response.result,
        };
    } catch (e: any) {
        return {
            success: false,
            message: e.message,
        };
    }
}

/**
 * Configure tunnel ingress (what the tunnel routes to)
 */
export async function configureTunnelIngress(
    credentials: CloudflareCredentials,
    tunnelId: string,
    hostname: string,
    serviceUrl: string
): Promise<{ success: boolean; message: string }> {
    try {
        const response = await cfFetch<any>(
            credentials,
            `/accounts/${credentials.accountId}/cfd_tunnel/${tunnelId}/configurations`,
            {
                method: 'PUT',
                body: JSON.stringify({
                    config: {
                        ingress: [
                            {
                                hostname,
                                service: serviceUrl,
                            },
                            {
                                service: 'http_status:404',
                            },
                        ],
                    },
                }),
            }
        );

        if (!response.success) {
            return {
                success: false,
                message: response.errors?.[0]?.message || 'Failed to configure tunnel',
            };
        }

        return {
            success: true,
            message: 'Tunnel configured',
        };
    } catch (e: any) {
        return {
            success: false,
            message: e.message,
        };
    }
}

/**
 * Create DNS CNAME record pointing to the tunnel
 */
export async function createDnsRecord(
    credentials: CloudflareCredentials,
    tunnelId: string,
    subdomain: string,
    zoneName: string
): Promise<{ success: boolean; message: string }> {
    try {
        const hostname = subdomain ? `${subdomain}.${zoneName}` : zoneName;
        
        // First, check if record already exists
        const existingResponse = await cfFetch<DnsRecord[]>(
            credentials,
            `/zones/${credentials.zoneId}/dns_records?type=CNAME&name=${hostname}`
        );

        if (existingResponse.success && existingResponse.result.length > 0) {
            // Update existing record
            const recordId = existingResponse.result[0].id;
            const updateResponse = await cfFetch<DnsRecord>(
                credentials,
                `/zones/${credentials.zoneId}/dns_records/${recordId}`,
                {
                    method: 'PUT',
                    body: JSON.stringify({
                        type: 'CNAME',
                        name: hostname,
                        content: `${tunnelId}.cfargotunnel.com`,
                        proxied: true,
                    }),
                }
            );

            if (!updateResponse.success) {
                return {
                    success: false,
                    message: updateResponse.errors?.[0]?.message || 'Failed to update DNS record',
                };
            }

            return {
                success: true,
                message: `DNS record updated for ${hostname}`,
            };
        }

        // Create new record
        const response = await cfFetch<DnsRecord>(
            credentials,
            `/zones/${credentials.zoneId}/dns_records`,
            {
                method: 'POST',
                body: JSON.stringify({
                    type: 'CNAME',
                    name: hostname,
                    content: `${tunnelId}.cfargotunnel.com`,
                    proxied: true,
                }),
            }
        );

        if (!response.success) {
            return {
                success: false,
                message: response.errors?.[0]?.message || 'Failed to create DNS record',
            };
        }

        return {
            success: true,
            message: `DNS record created for ${hostname}`,
        };
    } catch (e: any) {
        return {
            success: false,
            message: e.message,
        };
    }
}

/**
 * Delete a tunnel
 */
export async function deleteTunnel(
    credentials: CloudflareCredentials,
    tunnelId: string
): Promise<{ success: boolean; message: string }> {
    try {
        const response = await cfFetch<TunnelInfo>(
            credentials,
            `/accounts/${credentials.accountId}/cfd_tunnel/${tunnelId}`,
            {
                method: 'DELETE',
            }
        );

        if (!response.success) {
            return {
                success: false,
                message: response.errors?.[0]?.message || 'Failed to delete tunnel',
            };
        }

        return {
            success: true,
            message: 'Tunnel deleted',
        };
    } catch (e: any) {
        return {
            success: false,
            message: e.message,
        };
    }
}

/**
 * Delete DNS record
 */
export async function deleteDnsRecord(
    credentials: CloudflareCredentials,
    hostname: string
): Promise<{ success: boolean; message: string }> {
    try {
        // Find the record
        const existingResponse = await cfFetch<DnsRecord[]>(
            credentials,
            `/zones/${credentials.zoneId}/dns_records?type=CNAME&name=${hostname}`
        );

        if (!existingResponse.success || existingResponse.result.length === 0) {
            return {
                success: true,
                message: 'DNS record not found (already deleted)',
            };
        }

        const recordId = existingResponse.result[0].id;
        const response = await cfFetch<{ id: string }>(
            credentials,
            `/zones/${credentials.zoneId}/dns_records/${recordId}`,
            {
                method: 'DELETE',
            }
        );

        if (!response.success) {
            return {
                success: false,
                message: response.errors?.[0]?.message || 'Failed to delete DNS record',
            };
        }

        return {
            success: true,
            message: 'DNS record deleted',
        };
    } catch (e: any) {
        return {
            success: false,
            message: e.message,
        };
    }
}

/**
 * Full setup: create tunnel, configure ingress, create DNS record
 */
export async function setupTunnel(
    credentials: CloudflareCredentials,
    tunnelName: string,
    subdomain: string,
    localPort: number
): Promise<{
    success: boolean;
    message: string;
    tunnelId?: string;
    tunnelToken?: string;
    hostname?: string;
}> {
    // Get zone name
    const zoneName = await getZoneName(credentials);
    if (!zoneName) {
        return { success: false, message: 'Failed to get zone name' };
    }

    const hostname = subdomain ? `${subdomain}.${zoneName}` : zoneName;

    // Create tunnel
    console.log(`☁️  Creating tunnel "${tunnelName}"...`);
    const createResult = await createTunnel(credentials, tunnelName);
    if (!createResult.success || !createResult.tunnelId) {
        return { success: false, message: createResult.message };
    }

    const tunnelId = createResult.tunnelId;
    console.log(`✅ Tunnel created: ${tunnelId}`);

    // Configure ingress
    console.log(`☁️  Configuring tunnel ingress...`);
    const ingressResult = await configureTunnelIngress(
        credentials,
        tunnelId,
        hostname,
        `http://localhost:${localPort}`
    );
    if (!ingressResult.success) {
        // Try to clean up
        await deleteTunnel(credentials, tunnelId);
        return { success: false, message: ingressResult.message };
    }
    console.log(`✅ Ingress configured`);

    // Get tunnel token
    console.log(`☁️  Getting tunnel token...`);
    const tokenResult = await getTunnelToken(credentials, tunnelId);
    if (!tokenResult.success || !tokenResult.token) {
        // Try to clean up
        await deleteTunnel(credentials, tunnelId);
        return { success: false, message: tokenResult.message || 'Failed to get token' };
    }
    console.log(`✅ Token retrieved`);

    // Create DNS record
    console.log(`☁️  Creating DNS record for ${hostname}...`);
    const dnsResult = await createDnsRecord(credentials, tunnelId, subdomain, zoneName);
    if (!dnsResult.success) {
        console.warn(`⚠️  DNS creation failed: ${dnsResult.message}`);
        // Don't fail completely - tunnel still works, DNS might already exist
    } else {
        console.log(`✅ DNS record created`);
    }

    return {
        success: true,
        message: `Tunnel setup complete! Your URL: https://${hostname}`,
        tunnelId,
        tunnelToken: tokenResult.token,
        hostname,
    };
}

/**
 * Full teardown: delete tunnel and DNS record
 */
export async function teardownTunnel(
    credentials: CloudflareCredentials,
    tunnelId: string,
    hostname: string
): Promise<{ success: boolean; message: string }> {
    // Delete DNS record first
    console.log(`☁️  Deleting DNS record...`);
    await deleteDnsRecord(credentials, hostname);

    // Delete tunnel
    console.log(`☁️  Deleting tunnel...`);
    const result = await deleteTunnel(credentials, tunnelId);
    
    return result;
}
