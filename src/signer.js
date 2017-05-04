/* eslint no-console:0 */
/* global chrome, CryptoJS */
const algorithm = 'AWS4-HMAC-SHA256';
const hashedPayloads = [];

let enabled = false;
let region = '';
let service = '';
let accesskeyid = '';
let secretaccesskey = '';
let securitytoken = '';
let credentialTypeInstanceProfile = false;
// let credentialTypeExplicit = false;

let instanceprofilecredentialscached = false;
let instanceprofilecredentialsexpiry;

const log = msg => {
  console.log(msg);
};

const getinstanceprofilecredentials = () => {
  log('instance profile credential check');

  if (!enabled || !credentialTypeInstanceProfile) {
    return;
  }

  setTimeout(() => { getinstanceprofilecredentials(); }, 60000);

  if (instanceprofilecredentialscached && instanceprofilecredentialsexpiry > new Date()) {
    return;
  }

  // http://169.254.169.254 is the instance metadata service, see docs:
  // http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html
  const profileurl = 'http://169.254.169.254/latest/meta-data/iam/security-credentials/';

  const x = new XMLHttpRequest();
  x.open('GET', profileurl);
  x.onerror = () => log('error calling instance profile service');
  x.onload = () => {
    if (!x.response) {
      return;
    }
    const roles = x.response.split('<br/>');
    if (!roles.length) {
      return;
    }
    const xx = new XMLHttpRequest();
    xx.responseType = 'json';
    xx.open('GET', profileurl + roles[0]);
    xx.onload = () => {
      if (xx.response && xx.response.Code === 'Success') {
        accesskeyid = xx.response.AccessKeyId;
        secretaccesskey = xx.response.SecretAccessKey;
        securitytoken = xx.response.Token;
        instanceprofilecredentialsexpiry = new Date(xx.response.Expiration);
        instanceprofilecredentialscached = true;
      }
    };
    xx.send();
  };
  try {
    x.send();
  } catch (err) {
    log(`could not reach instance profile service: ${err}`);
  }
};

const getsettings = () => chrome.storage.sync.get({
  enabled: true,
  region: 'ap-southeast-2',
  service: 'es',
  accesskeyid: '',
  secretaccesskey: '',
  securitytoken: '',
  credentialTypeInstanceProfile: true,
  credentialTypeExplicit: false,
}, items => {
  enabled = items.enabled;
  region = items.region;
  service = items.service;
  accesskeyid = items.accesskeyid;
  secretaccesskey = items.secretaccesskey;
  securitytoken = items.securitytoken;
  credentialTypeInstanceProfile = items.credentialTypeInstanceProfile;
  // credentialTypeExplicit = items.credentialTypeExplicit;

  chrome.browserAction.setIcon({ path: (enabled) ? 'icon.png' : 'icon-off.png' });
  if (credentialTypeInstanceProfile) {
    getinstanceprofilecredentials();
  }
});


const uriEncode = (input, slash) => {
  let ch;
  let i;
  let output = '';
  for (i = 0; i < input.length; i++) {
    ch = input[i];
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '_' || ch === '-' || ch === '~' || ch === '.' || (!slash && ch === '/')) {
      output += ch;
    } else {
      output += `%${ch.charCodeAt(0).toString(16).toUpperCase()}`;
    }
  }
  return output;
};
const uriEncodeSlash = input => uriEncode(input, true);

const valid = details => {
  if (!region || region.length === 0 || !service || service.length === 0 || !accesskeyid ||
    accesskeyid.length === 0 || !secretaccesskey || secretaccesskey.length === 0) {
    return false;
  }

  // check that requested host matches configured service
  let hostMatchesService = false;
  const parser = document.createElement('a');
  parser.href = details.url;
  const hostname = parser.hostname.toLowerCase();

  const hostparts = hostname.split('.');
  for (let i = 0; i < hostparts.length; i++) {
    const part = hostparts[i];
    if (part === service || (service === 's3' && part.startsWith('s3'))) {
      hostMatchesService = true;
      break;
    }
  }
  if (!hostMatchesService) {
    return false;
  }

  return true;
};

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') getsettings();
});

chrome.webRequest.onBeforeRequest.addListener(details => {
  if (!enabled || !valid(details)) {
    return;
  }

  const body = details.requestBody;
  let hashedPayload;
  if (body && body.raw && body.raw.length > 0 && body.raw[0].bytes) {
    const str = String.fromCharCode(...new Uint8Array(body.raw[0].bytes));
    log(`Raw Payload: ${str}`);
    hashedPayload = CryptoJS.SHA256(str);
  } else {
    hashedPayload = CryptoJS.SHA256('');
  }

  hashedPayloads[details.requestId] = hashedPayload;
  log(`Hashed Payload: ${hashedPayload}`);
},
  { urls: ['*://*.amazonaws.com/*'],
    types: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'other'] },
['blocking', 'requestBody']
);

chrome.webRequest.onBeforeSendHeaders.addListener(request => {
  if (!enabled || !valid(request)) {
    return undefined;
  }

  log(`Region: ${region}`);
  log(`Service: ${service}`);
  log(`Access Key Id: ${accesskeyid}`);
  log(`Secret Access Key: ${secretaccesskey}`);
  log(`Security Token: ${securitytoken}`);

  const amzDateTime = (new Date()).toISOString().replace(/[:-]|\.\d{3}/g, '');
  const amzDate = amzDateTime.substr(0, 8);
  log(`AmzDateTime: ${amzDateTime}`);

  const headers = request.requestHeaders;
  const parser = document.createElement('a');
  parser.href = request.url;
  headers.push({ name: 'Host', value: parser.hostname.toLowerCase() });

  // CanonicalUri
  let uri = parser.pathname;
  if (uri.length === 0) {
    uri = '/';
  } else if (uri.substr(0, 1) !== '/') {
    uri = `/${uri}`;
  }
  const canonicalUri = uriEncode(uri);
  log(`Canonical URI: ${canonicalUri}`);

  // CanonicalQueryString
  const params = parser.search.split('&');
  for (let i = 0; i < params.length; i++) {
    if (params[i].substr(0, 1) === '?') {
      params[i] = params[i].substr(1, params[i].length - 1);
    }
    params[i] = params[i].split('=').map(decodeURIComponent).map(uriEncodeSlash).join('=');
  }
  const canonicalQuerystring = params.sort().join('&');
  log(`Canonical Querystring: ${canonicalQuerystring}`);

  // CanonicalHeaders
  const aggregatedHeaders = [];
  for (let i = 0; i < headers.length; i++) {
    const name = headers[i].name.toLowerCase();

    if (!name.includes('x-devtools-')) {
      let headerfound = false;
      for (let x = 0; x < aggregatedHeaders.length; x++) {
        if (aggregatedHeaders[x].substr(0, name.length) === name) {
          aggregatedHeaders[x] += headers[i].value.trim();
          headerfound = true;
          break;
        }
      }

      if (!headerfound) {
        aggregatedHeaders.push(`${name}:${headers[i].value}`);
      }
    }
  }
  aggregatedHeaders.sort((a, b) => {
    const name1 = a.substr(0, a.indexOf(':'));
    const name2 = b.substr(0, b.indexOf(':'));
    if (name1 < name2) return -1;
    return (name1 > name2) ? 1 : 0;
  });
  const canonicalHeaders = aggregatedHeaders.join('\n');
  log(`Canonical Headers: ${canonicalHeaders}`);

  // SignedHeaders
  const tempSignedHeaders = [];
  for (let i = 0; i < headers.length; i++) {
    const name = headers[i].name.toLowerCase();
    if (!name.includes('x-devtools-')) {
      tempSignedHeaders.push(name);
    }
  }
  const signedHeaders = tempSignedHeaders.sort().join(';');
  log(`Signed Headers: ${signedHeaders}`);

  const canonicalRequest = `${request.method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n\n${signedHeaders}\n${hashedPayloads[request.requestId]}`;
  log(`Canonical Request: ${canonicalRequest}`);

  const canonicalRequestHash = CryptoJS.SHA256(canonicalRequest);
  log(`Canonical Request Hash: ${canonicalRequestHash}`);

  const stringToSign = `${algorithm}\n${amzDateTime}\n${amzDate}/${region}/${service}/aws4_request\n${canonicalRequestHash}`;
  log(`String To Sign: ${stringToSign}`);

  const signature = [amzDate, region, service, 'aws4_request', stringToSign].reduce((key, value) => CryptoJS.HmacSHA256(value, key), `AWS4${secretaccesskey}`);
  log(`Signature: ${signature}`);

  const authorization = `${algorithm} Credential=${accesskeyid}/${amzDate}/${region}/${service}/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  log(`Authorization: ${authorization}`);

  headers.push({ name: 'X-Amz-Algorithm', value: algorithm });
  headers.push({ name: 'X-Amz-Date', value: amzDateTime });
  headers.push({ name: 'Authorization', value: authorization });
  if (securitytoken) {
    headers.push({ name: 'X-Amz-Security-Token', value: securitytoken });
  }

  delete hashedPayloads[request.requestId];

  return { requestHeaders: headers };
}, {
  urls: ['*://*.amazonaws.com/*'],
  types: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'other'],
}, ['blocking', 'requestHeaders']);

getsettings();
