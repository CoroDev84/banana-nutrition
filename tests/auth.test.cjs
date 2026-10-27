const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const assert = require('node:assert/strict');
const file = process.argv[2] || path.join(__dirname, '..', 'nutrition-firebase.js');
const source = fs.readFileSync(file,'utf8').replace(/import[\s\S]*?from "[^"]+";/g, '').replace(/export /g, '');
let calls = [], linkResult, linkError;
class Provider {constructor(id){this.id=id;this.scopes=[];} setCustomParameters(p){this.parameters=p;} addScope(s){this.scopes.push(s);}}
const auth = {currentUser:{uid:'original',getIdToken:async force=>{calls.push(['refresh',force]);return 'token';}}};
const config = {firebase:{},signInProviders:{github:false,microsoft:true,facebook:true}};
const context = vm.createContext({window:{NUTRITION_APP_CONFIG:config},initializeApp:()=>({}),getAuth:()=>auth,
 GoogleAuthProvider:class extends Provider{constructor(){super('google.com')}},GithubAuthProvider:class extends Provider{constructor(){super('github.com')}},
 getRedirectResult:async()=>null,onAuthStateChanged:()=>{},
 signInWithPopup:async(a,p)=>{calls.push(['signin',p]);return {user:a.currentUser};},
 linkWithPopup:async(u,p)=>{calls.push(['link',u.uid,p]);if(linkError)throw linkError;return linkResult||{user:u};},
 signOut:async a=>{calls.push(['signout']);a.currentUser=null;}
});
vm.runInContext(source.replace(/\{ auth \};\s*$/,'')+'\nglobalThis.api={getEnabledProviders,signInWithProvider,linkSignInProvider,authErrorMessage};',context);
(async()=>{
 const api=context.api;
 assert.equal(api.getEnabledProviders().length,1);
 for(const provider of ['github','microsoft','facebook','unknown']) assert.throws(()=>api.signInWithProvider(provider),e=>e.code==='auth/operation-not-allowed');
 config.signInProviders.github=true;
 assert.equal(api.getEnabledProviders().length,2);
 await api.signInWithProvider('google');assert.equal(calls.at(-1)[1].parameters.prompt,'select_account');
 await api.signInWithProvider('github');assert.equal(calls.at(-1)[1].id,'github.com');assert.equal(calls.at(-1)[1].scopes[0],'user:email');
 calls=[];await api.linkSignInProvider('github');assert.equal(calls[0][0],'link');assert.equal(calls[0][1],'original');assert.equal(calls[1][0],'refresh');assert.equal(auth.currentUser.uid,'original');
 linkError=Object.assign(new Error('private diagnostic'),{code:'auth/credential-already-in-use'});
 await assert.rejects(api.linkSignInProvider('github'),e=>e===linkError);assert.equal(auth.currentUser.uid,'original');assert.match(api.authErrorMessage(linkError,true),/not been merged/);
 assert.ok(!api.authErrorMessage(new Error('private token')).includes('private'));
 linkError=null;linkResult={user:{uid:'unexpected'}};
 await assert.rejects(api.linkSignInProvider('github'),e=>e.code==='auth/user-mismatch');assert.equal(auth.currentUser,null);
 console.log('PASS Google/GitHub only; scopes; same-UID linking; conflict preservation; token refresh; mismatch sign-out');
})().catch(e=>{console.error(e);process.exitCode=1});
