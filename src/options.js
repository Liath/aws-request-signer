/* eslint-env browser */
/* eslint no-console:0 */
/* global chrome */
let iconNum = 0;

const toggleCredentialInputs = instanceprofile => {
  document.getElementById('accesskeyid').disabled = instanceprofile;
  document.getElementById('secretaccesskey').disabled = instanceprofile;
  document.getElementById('securitytoken').disabled = instanceprofile;
};

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get({
    enabled: true,
    region: 'ap-southeast-2',
    service: 'es',
    accesskeyid: '',
    secretaccesskey: '',
    securitytoken: '',
    credentialTypeInstanceProfile: true,
    credentialTypeExplicit: false,
  }, items => {
    document.getElementById('enabled').checked = items.enabled;
    document.getElementById('region').value = items.region;
    document.getElementById('service').value = items.service;
    document.getElementById('accesskeyid').value = items.accesskeyid;
    document.getElementById('secretaccesskey').value = items.secretaccesskey;
    document.getElementById('securitytoken').value = items.securitytoken;
    document.getElementById('credentialTypeInstanceProfile').checked = items.credentialTypeInstanceProfile;
    document.getElementById('credentialTypeExplicit').checked = items.credentialTypeExplicit;
    toggleCredentialInputs(items.credentialTypeInstanceProfile);
  });
});
document.getElementById('credentialTypeInstanceProfile').addEventListener('click', e => {
  toggleCredentialInputs(true);
});
document.getElementById('credentialTypeExplicit').addEventListener('click', e => {
  toggleCredentialInputs(false);
});
document.getElementById('enabled').addEventListener('click', e => {
  const enabled = e.srcElement.checked;
  document.getElementById('region').disabled = !enabled;
  document.getElementById('service').disabled = !enabled;
  document.getElementById('credentialTypeInstanceProfile').disabled = !enabled;
  document.getElementById('credentialTypeExplicit').disabled = !enabled;
  if (!enabled) {
    toggleCredentialInputs(true);
  } else {
    toggleCredentialInputs(document.getElementById('credentialTypeInstanceProfile').checked);
  }
});
document.getElementById('save').addEventListener('click', () => {
  const enabled = document.getElementById('enabled').checked;
  const region = document.getElementById('region').value;
  const service = document.getElementById('service').value;
  const accesskeyid = document.getElementById('accesskeyid').value;
  const secretaccesskey = document.getElementById('secretaccesskey').value;
  const securitytoken = document.getElementById('securitytoken').value;
  const credentialTypeInstanceProfile = document.getElementById('credentialTypeInstanceProfile').checked;
  const credentialTypeExplicit = document.getElementById('credentialTypeExplicit').checked;

  chrome.storage.sync.set({
    enabled,
    region,
    service,
    accesskeyid,
    secretaccesskey,
    securitytoken,
    credentialTypeInstanceProfile,
    credentialTypeExplicit,
  }, () => {
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(() => {
      status.textContent = '';
    }, 1000);
  });
});

window.setInterval(() => {
  iconNum += 1;
  document.getElementById('icon').src = `icon-${iconNum}.png`;
  if (iconNum > 2) {
    iconNum = 0;
  }
}, 1000);
