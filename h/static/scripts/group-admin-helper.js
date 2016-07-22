function makeRequest (method, url) {
	  return new Promise(function (resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open(method, url);
		xhr.onload = function () {
		  if (this.status >= 200 && this.status < 300) {
			resolve(xhr.response);
		  } else {
			reject({
			  status: this.status,
			  statusText: xhr.statusText
			});
		  }
		};
		xhr.onerror = function () {
		  reject({
			status: this.status,
			statusText: xhr.statusText
		  });
		};
		xhr.send();
	  });
	}

var config;
var url = 'https://drive.google.com/uc?export=download&id=0Bz4y9G08pmrYcU9PNDN5bUxJdTQ'; 
console.log('getting config');
makeRequest('GET', url).then(
			function(response) {
			  console.log('config: ' + response);
              config = JSON.parse(response);
 			  localStorage.setItem('admin_ids',  JSON.stringify(config.admin_ids) );
			  localStorage.setItem('admin_keys', JSON.stringify(config.admin_keys) );
			  localStorage.setItem('subject_users', JSON.stringify(config.subject_users) );
			});

