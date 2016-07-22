This experimental branch enables a simple form of group administration.

The extension reads a configuration file named in group-admin-helper.js, which defines:

1. A set of users subject to having annotations edited or deleted by the operator of the extension.
2. API keys provided by those users.

This info lands in the extension's localStorage like so:

```
  localStorage.setItem('admin_ids',  JSON.stringify(config.admin_ids) );
  localStorage.setItem('admin_keys', JSON.stringify(config.admin_keys) );
  localStorage.setItem('subject_users', JSON.stringify(config.subject_users) );

```

In the JS generated from permissions.coffee, it adds this:

```
// begin group admin variant
        function isSubjectToAdmin(user) {
          try {
          var subject_users = JSON.parse(localStorage.getItem('subject_users'));
          return subject_users.indexOf(user) != -1;
            }
          catch (e) {
            return false;
            }
          }
        var check_user = context.user.replace('acct:','').replace('@hypothes.is','');
        if ( isSubjectToAdmin(check_user) ) {
          var admin_ids = JSON.parse(localStorage.getItem('admin_ids'));
          var ids_for_user = admin_ids[check_user];
          if ( ids_for_user ) {
            if ( ids_for_user.indexOf(context.id) == -1) 
              ids_for_user.push(context.id);
          }
          else 
            ids_for_user = [context.id];
          admin_ids[check_user] = ids_for_user;
          localStorage.setItem('admin_ids', JSON.stringify(admin_ids));
          return true;
          }
// end group admin variant
```

This logic intercepts the permissions check at the point where permissions are evaluated for an annotation card dispayed in the sidebar. It:

- Captures the username of the user who created the annotation.
- Looks for that username in the list of subject_users relayed from the config field to local storage.
- If found, retrieves (from local storage) the (initially empty) list of administratable ids (`admin_ids`) 
- And updates it to include the id of the current annotation

This exposes edit and delete buttons on annotations created by subject users named in the config file. 

This info is then used in angular.jwt.interceptor like so:

```
  angular.module('angular-jwt.interceptor', [])
  .provider('jwtInterceptor', function() {

    this.urlParam = null;
    this.authHeader = 'Authorization';
    this.authPrefix = 'Bearer ';
    this.tokenGetter = function() {
      return null;
    }

    var config = this;

    this.$get = ["$q", "$injector", "$rootScope", function ($q, $injector, $rootScope) {
      return {
        request: function (request) {
          if (request.skipAuthorization) {
            return request;
          }

          if (config.urlParam) {
            request.params = request.params || {};
            // Already has the token in the url itself
            if (request.params[config.urlParam]) {
              return request;
            }
          } else {
            request.headers = request.headers || {};
            // Already has an Authorization header
            if (request.headers[config.authHeader]) {
              return request;
            }
          }

          var tokenPromise = $q.when($injector.invoke(config.tokenGetter, this, {
            config: request
          }));

// begin group admin 
	  var maybeChangeDeleteToken = function(request, token, admin_ids, admin_keys) {
            var id = request.url.match(/https:\/\/hypothes.is\/api\/annotations\/(.+)/)[1];
			for (var subjectUser in admin_ids) {
				if ( admin_ids[subjectUser].indexOf(id) != -1 )
					return admin_keys[subjectUser];
			}
				
         	return token;
		  }

	  var maybeChangeUpdateToken = function(request, token, admin_ids, admin_keys) {
            var id = request.data.id;
			for (var subjectUser in admin_ids) {
				if ( admin_ids[subjectUser].indexOf(id) != -1 )
					return admin_keys[subjectUser];
			}
		  return token;
		  }


          return tokenPromise.then(function(token) {
            if (token) {
              if (config.urlParam) {
                request.params[config.urlParam] = token;
              } else {
				var apiPattern = 'https://hypothes.is/api/annotations';
				var admin_ids = JSON.parse(localStorage.getItem('admin_ids'));
				var admin_keys = JSON.parse(localStorage.getItem('admin_keys'));
				if ( request.url.startsWith(apiPattern) && request.method == 'DELETE' )
					token = maybeChangeDeleteToken(request, token, admin_ids, admin_keys);
				if ( request.url.startsWith(apiPattern) && request.method == 'PUT' )
					token = maybeChangeUpdateToken(request, token, admin_ids, admin_keys);
                request.headers[config.authHeader] = config.authPrefix + token;
              }
            }
            return request;
          });
        },

// end group admin 

        responseError: function (response) {
          // handle the case where the user is not authenticated
          if (response.status === 401) {
            $rootScope.$broadcast('unauthenticated', response);
          }
          return $q.reject(response);
        }
      };
    }];
  });


  ```

