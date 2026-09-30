export type Settings={backendUrl:string;autoAnalyze:boolean;autoFill:boolean;strongMatch:number;minimumAnalysis:number;debug:boolean};
export const defaults:Settings={backendUrl:'http://localhost:8001',autoAnalyze:true,autoFill:true,strongMatch:80,minimumAnalysis:60,debug:false};
export async function getSettings(){return {...defaults,...await chrome.storage.sync.get(defaults)} as Settings}
export type Account={email:string};
export async function getSession(){return await chrome.storage.local.get(['authToken','account']) as {authToken?:string;account?:Account}}
export async function saveSession(authToken:string,account:Account){await chrome.storage.local.set({authToken,account})}
export async function clearSession(){await chrome.storage.local.remove(['authToken','account'])}
export async function requestBackendAccess(backendUrl:string){const url=new URL(backendUrl);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Use HTTPS for a hosted backend');const origin=`${url.origin}/*`;return chrome.permissions.contains({origins:[origin]})||chrome.permissions.request({origins:[origin]})}
export async function getNaukriProfileSync(){return await chrome.storage.local.get('naukriProfileSync') as {naukriProfileSync?:string}}
export async function saveNaukriProfileSync(value:string){await chrome.storage.local.set({naukriProfileSync:value})}
export async function getNaukriProfileContext(){return await chrome.storage.local.get('naukriProfileContext') as {naukriProfileContext?:string}}
export async function saveNaukriProfileContext(value:string){await chrome.storage.local.set({naukriProfileContext:value})}
export type NaukriProfileSummary={currentTitle?:string;location?:string;experienceYears?:number;skills?:string[]};
export async function getNaukriProfileSummary(){return await chrome.storage.local.get('naukriProfileSummary') as {naukriProfileSummary?:NaukriProfileSummary}}
export async function saveNaukriProfileSummary(value:NaukriProfileSummary){await chrome.storage.local.set({naukriProfileSummary:value})}
