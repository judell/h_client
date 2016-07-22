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
- If found, retrieves (from local storage) the (initially empty) list of administratable ids (`admin_ids`) and updates it to include the id of the current annotation
- 
