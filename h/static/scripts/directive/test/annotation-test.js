/* jshint node: true */
'use strict';

var angular = require('angular');
var proxyquire = require('proxyquire');

var events = require('../../events');
var fixtures = require('../../test/annotation-fixtures');
var testUtil = require('../../test/util');
var util = require('./util');

var inject = angular.mock.inject;

var fakeDocumentMeta = {
  domain: 'docs.io',
  titleLink: 'http://docs.io/doc.html',
  titleText: 'Dummy title',
};

/**
 * Returns the annotation directive with helpers stubbed out.
 */
function annotationDirective() {
  var noop = function () { return ''; };

  var annotation = proxyquire('../annotation', {
    angular: testUtil.noCallThru(angular),
    '../filter/persona': {
      username: noop,
    },
    '../annotation-metadata': {
      domainAndTitle: function (annot) { // eslint-disable-line no-unused-vars
        return fakeDocumentMeta;
      },
    },
  });

  return annotation.directive;
}

describe('annotation', function() {
  describe('updateModel()', function() {
    var updateModel = require('../annotation').updateModel;

    function fakePermissions() {
      return {
        shared: function() {},
        private: function() {},
      };
    }

    it('copies tags and text into the new model', function() {
      var changes = {text: 'bar', tags: ['foo', 'bar']};
      var newModel = updateModel(fixtures.defaultAnnotation(), changes,
        fakePermissions());
      assert.deepEqual(newModel.tags, changes.tags);
      assert.equal(newModel.text, changes.text);
    });

    it('sets permissions to private if the draft is private', function() {
      var changes = {isPrivate: true, text: 'bar', tags: ['foo', 'bar']};
      var annot = fixtures.defaultAnnotation();
      var permissions = fakePermissions();
      permissions.private = sinon.stub().returns('private permissions');
      var newModel = updateModel(annot, changes, permissions);
      assert.equal(newModel.permissions, 'private permissions');
    });

    it('sets permissions to shared if the draft is shared', function() {
      var changes = {isPrivate: false, text: 'bar', tags: ['foo', 'bar']};
      var annot = fixtures.defaultAnnotation();
      var permissions = fakePermissions();
      permissions.shared = sinon.stub().returns('shared permissions');
      var newModel = updateModel(annot, changes, permissions);
      assert.equal(newModel.permissions, 'shared permissions');
    });
  });

  describe('AnnotationController', function() {
    var $q;
    var $rootScope;
    var $scope;
    var $timeout;
    var $window;
    var fakeAnnotationMapper;
    var fakeDrafts;
    var fakeFlash;
    var fakeGroups;
    var fakePermissions;
    var fakeSession;
    var fakeStore;
    var sandbox;

    function createDirective(annotation) {
      annotation = annotation || fixtures.defaultAnnotation();
      var element = util.createDirective(document, 'annotation', {
        annotation: annotation,
      });

      // A new annotation won't have any saved drafts yet.
      if (!annotation.id) {
        fakeDrafts.get.returns(null);
      }

      return {
        annotation: annotation,
        controller: element.ctrl,
        element: element,
        scope: element.scope,
      };
    }

    before(function() {
      angular.module('h', [])
        .directive('annotation', annotationDirective());
    });

    beforeEach(angular.mock.module('h'));
    beforeEach(angular.mock.module(function($provide) {
      sandbox = sinon.sandbox.create();

      fakeAnnotationMapper = {
        createAnnotation: sandbox.stub().returns({
          permissions: {
            read: ['acct:bill@localhost'],
            update: ['acct:bill@localhost'],
            destroy: ['acct:bill@localhost'],
            admin: ['acct:bill@localhost'],
          },
        }),
        deleteAnnotation: sandbox.stub(),
      };

      var fakeAnnotationUI = {};

      fakeDrafts = {
        update: sandbox.stub(),
        remove: sandbox.stub(),
        get: sandbox.stub(),
      };

      var fakeFeatures = {
        flagEnabled: sandbox.stub().returns(true),
      };

      fakeFlash = {
        error: sandbox.stub(),
      };

      fakePermissions = {
        isShared: sandbox.stub().returns(true),
        isPrivate: sandbox.stub().returns(false),
        permits: sandbox.stub().returns(true),
        shared: sandbox.stub().returns({
          read: ['everybody'],
        }),
        'private': sandbox.stub().returns({
          read: ['justme'],
        }),
        'default': sandbox.stub().returns({
          read: ['default'],
        }),
        setDefault: sandbox.stub(),
      };

      fakeSession = {
        state: {
          userid: 'acct:bill@localhost',
        },
      };

      var fakeSettings = {
        serviceUrl: 'https://test.hypothes.is/',
      };

      fakeGroups = {
        focused: function() {
          return {};
        },
        get: function() {},
      };

      fakeStore = {
        annotation: {
          create: sinon.spy(function (annot) {
            return Promise.resolve(Object.assign({}, annot));
          }),
          update: sinon.spy(function (annot) {
            return Promise.resolve(Object.assign({}, annot));
          }),
        },
      };

      $provide.value('annotationMapper', fakeAnnotationMapper);
      $provide.value('annotationUI', fakeAnnotationUI);
      $provide.value('drafts', fakeDrafts);
      $provide.value('features', fakeFeatures);
      $provide.value('flash', fakeFlash);
      $provide.value('groups', fakeGroups);
      $provide.value('permissions', fakePermissions);
      $provide.value('session', fakeSession);
      $provide.value('settings', fakeSettings);
      $provide.value('store', fakeStore);
    }));

    beforeEach(
      inject(
        function(_$q_, _$rootScope_, _$timeout_,
                _$window_) {
          $window = _$window_;
          $q = _$q_;
          $timeout = _$timeout_;
          $rootScope = _$rootScope_;
          $scope = $rootScope.$new();
        }
      )
    );

    afterEach(function() {
      sandbox.restore();
    });

    describe('initialization', function() {
      it('sets the user of annotations that don\'t have one', function() {
        // You can create annotations while logged out and then login.
        // When you login a new AnnotationController instance is created for
        // each of your annotations, and on initialization it will set the
        // annotation's user to your username from the session.
        var annotation = fixtures.newAnnotation();
        annotation.user = undefined;
        fakeSession.state.userid = 'acct:bill@localhost';

        createDirective(annotation);

        assert.equal(annotation.user, 'acct:bill@localhost');
      });

      it('sets the permissions of new annotations', function() {
        // You can create annotations while logged out and then login.
        // When you login a new AnnotationController instance is created for
        // each of your annotations, and on initialization it will set the
        // annotation's permissions using your username from the session.
        var annotation = fixtures.newAnnotation();
        annotation.user = annotation.permissions = undefined;
        annotation.group = '__world__';
        fakeSession.state.userid = 'acct:bill@localhost';
        fakePermissions.default = function (group) {
          return 'default permissions for ' + group;
        };

        createDirective(annotation);

        assert.equal(annotation.permissions,
          'default permissions for __world__');
      });

      it('sets the tags and text fields for new annotations', function () {
        var annotation = fixtures.newAnnotation();
        delete annotation.tags;
        delete annotation.text;
        createDirective(annotation);
        assert.equal(annotation.text, '');
        assert.deepEqual(annotation.tags, []);
      });

      it('preserves the permissions of existing annotations', function() {
        var annotation = fixtures.newAnnotation();
        annotation.permissions = {
          permissions: {
            read: ['foo'],
            update: ['bar'],
            'delete': ['gar'],
            admin: ['har'],
          },
        };
        var originalPermissions = JSON.parse(JSON.stringify(
          annotation.permissions));
        fakePermissions.default = function () {
          return 'new permissions';
        };
        fakePermissions.isShared = function () {};
        fakePermissions.isPrivate = function () {};
        createDirective(annotation);
        assert.deepEqual(annotation.permissions, originalPermissions);
      });

      it('saves new highlights to the server on initialization', function() {
        var annotation = fixtures.newHighlight();
        // The user is logged-in.
        annotation.user = fakeSession.state.userid = 'acct:bill@localhost';
        createDirective(annotation);

        assert.called(fakeStore.annotation.create);
      });

      it('saves new highlights to drafts if not logged in', function() {
        var annotation = fixtures.newHighlight();
        // The user is not logged-in.
        annotation.user = fakeSession.state.userid = undefined;

        createDirective(annotation);

        assert.notCalled(fakeStore.annotation.create);
        assert.called(fakeDrafts.update);
      });

      it('does not save new annotations on initialization', function() {
        var annotation = fixtures.newAnnotation();

        createDirective(annotation);

        assert.notCalled(fakeStore.annotation.create);
      });

      it('does not save old highlights on initialization', function() {
        var annotation = fixtures.oldHighlight();

        createDirective(annotation);

        assert.notCalled(fakeStore.annotation.create);
      });

      it('does not save old annotations on initialization', function() {
        var annotation = fixtures.oldAnnotation();

        createDirective(annotation);

        assert.notCalled(fakeStore.annotation.create);
      });

      it('creates drafts for new annotations on initialization', function() {
        var annotation = fixtures.newAnnotation();
        createDirective(annotation);
        assert.calledWith(fakeDrafts.update, annotation, {
          isPrivate: false,
          tags: annotation.tags,
          text: annotation.text,
        });
      });

      it('does not create drafts for new highlights on initialization', function() {
        var annotation = fixtures.newHighlight();
        var controller = createDirective(annotation).controller;

        assert.notOk(controller.editing());
        assert.notCalled(fakeDrafts.update);
      });

      it('edits annotations with drafts on initialization', function() {
        var annotation = fixtures.oldAnnotation();
        // The drafts service has some draft changes for this annotation.
        fakeDrafts.get.returns({text: 'foo', tags: []});

        var controller = createDirective(annotation).controller;

        assert.isTrue(controller.editing());
      });
    });

    describe('#editing()', function() {
      it('returns false if the annotation does not have a draft', function () {
        var controller = createDirective().controller;
        assert.notOk(controller.editing());
      });

      it('returns true if the annotation has a draft', function () {
        var controller = createDirective().controller;
        fakeDrafts.get.returns({tags: [], text: '', isPrivate: false});
        assert.isTrue(controller.editing());
      });

      it('returns false if the annotation has a draft but is being saved', function () {
        var controller = createDirective().controller;
        fakeDrafts.get.returns({tags: [], text: '', isPrivate: false});
        controller.isSaving = true;
        assert.isFalse(controller.editing());
      });
    });

    describe('#isHighlight()', function() {
      it('returns true for new highlights', function() {
        var annotation = fixtures.newHighlight();

        var vm = createDirective(annotation).controller;

        assert.isTrue(vm.isHighlight());
      });

      it('returns false for new annotations', function() {
        var annotation = fixtures.newAnnotation();

        var vm = createDirective(annotation).controller;

        assert.isFalse(vm.isHighlight());
      });

      it('returns false for page notes', function() {
        var annotation = fixtures.oldPageNote();

        var vm = createDirective(annotation).controller;

        assert.isFalse(vm.isHighlight());
      });

      it('returns false for replies', function() {
        var annotation = fixtures.oldReply();

        var vm = createDirective(annotation).controller;

        assert.isFalse(vm.isHighlight());
      });

      it('returns false for annotations with text but no tags', function() {
        var annotation = fixtures.oldAnnotation();
        annotation.text = 'This is my annotation';
        annotation.tags = [];

        var vm = createDirective(annotation).controller;

        assert.isFalse(vm.isHighlight());
      });

      it('returns false for annotations with tags but no text', function() {
        var annotation = fixtures.oldAnnotation();
        annotation.text = '';
        annotation.tags = ['foo'];

        var vm = createDirective(annotation).controller;

        assert.isFalse(vm.isHighlight());
      });

      it('returns true for annotations with no text or tags', function() {
        var annotation = fixtures.oldAnnotation();
        annotation.text = '';
        annotation.tags = [];

        var vm = createDirective(annotation).controller;

        assert.isTrue(vm.isHighlight());
      });
    });

    describe('when the annotation is a highlight', function() {
      var annotation;

      beforeEach(function() {
        annotation = fixtures.defaultAnnotation();
        annotation.$highlight = true;
      });

      it('is private', function() {
        delete annotation.id;
        createDirective(annotation);
        $scope.$digest();
        assert.deepEqual(annotation.permissions, {
          read: ['justme'],
        });
      });
    });

    describe('#reply', function() {
      var annotation;

      beforeEach(function() {
        annotation = fixtures.defaultAnnotation();
        annotation.permissions = {
          read: ['acct:joe@localhost'],
          update: ['acct:joe@localhost'],
          destroy: ['acct:joe@localhost'],
          admin: ['acct:joe@localhost'],
        };
      });

      it('creates a new reply with the proper uri and references', function() {
        var controller = createDirective(annotation).controller;
        var reply = sinon.match({
          references: [annotation.id],
          uri: annotation.uri,
        });
        controller.reply();
        assert.calledWith(fakeAnnotationMapper.createAnnotation, reply);
      });

      it('makes the reply shared if the parent is shared', function() {
        var controller = createDirective(annotation).controller;
        var perms = {read: ['agroup']};
        var reply = sinon.match({
          references: [annotation.id],
          permissions: perms,
          uri: annotation.uri,
        });
        fakePermissions.isShared.returns(true);
        fakePermissions.shared.returns(perms);
        controller.reply();
        assert.calledWith(fakeAnnotationMapper.createAnnotation, reply);
      });

      it('makes the reply private if the parent is private', function() {
        var controller = createDirective(annotation).controller;
        fakePermissions.isPrivate.returns(true);
        var perms = {read: ['onlyme']};
        fakePermissions.private.returns(perms);
        var reply = sinon.match({permissions: perms});
        controller.reply();
        assert.calledWith(fakeAnnotationMapper.createAnnotation, reply);
      }
      );

      it('sets the reply\'s group to be the same as its parent\'s', function() {
        var annotation = fixtures.defaultAnnotation();
        annotation.group = 'my group';
        var controller = createDirective(annotation).controller;
        var reply = sinon.match({group: annotation.group});
        controller.reply();
        assert.calledWith(fakeAnnotationMapper.createAnnotation, reply);
      });
    });

    describe('#setPrivacy', function() {
      it('makes the annotation private when level is "private"', function() {
        var parts = createDirective();
        parts.controller.setPrivacy('private');
        assert.calledWith(fakeDrafts.update, parts.controller.annotation, sinon.match({
          isPrivate: true,
        }));
      });

      it('makes the annotation shared when level is "shared"', function() {
        var parts = createDirective();
        parts.controller.setPrivacy('shared');
        assert.calledWith(fakeDrafts.update, parts.controller.annotation, sinon.match({
          isPrivate: false,
        }));
      });

      it('sets the default visibility level if "shared"', function() {
        var parts = createDirective();
        parts.controller.edit();
        parts.controller.setPrivacy('shared');
        assert.calledWith(fakePermissions.setDefault, 'shared');
      });

      it('sets the default visibility if "private"', function() {
        var parts = createDirective();
        parts.controller.edit();
        parts.controller.setPrivacy('private');
        assert.calledWith(fakePermissions.setDefault, 'private');
      });

      it('doesn\'t save the visibility if the annotation is a reply', function() {
        var parts = createDirective(fixtures.oldReply());
        parts.controller.setPrivacy('private');
        assert.notCalled(fakePermissions.setDefault);
      });
    });

    describe('#hasContent', function() {
      it('returns false if the annotation has no tags or text', function() {
        var controller = createDirective(fixtures.oldHighlight()).controller;
        assert.ok(!controller.hasContent());
      });

      it('returns true if the annotation has tags or text', function() {
        var controller = createDirective(fixtures.oldAnnotation()).controller;
        assert.ok(controller.hasContent());
      });
    });

    describe('#hasQuotes', function() {
      it('returns false if the annotation has no quotes', function() {
        var annotation = fixtures.defaultAnnotation();
        annotation.target = [{}];
        var controller = createDirective(annotation).controller;

        assert.isFalse(controller.hasQuotes());
      });

      it('returns true if the annotation has quotes', function() {
        var annotation = fixtures.defaultAnnotation();
        annotation.target = [
          {
            selector: [
              {
                type: 'TextQuoteSelector',
              },
            ],
          },
        ];
        var controller = createDirective(annotation).controller;

        assert.isTrue(controller.hasQuotes());
      });
    });

    describe('#delete()', function() {
      beforeEach(function() {
        fakeAnnotationMapper.deleteAnnotation = sandbox.stub();
      });

      it(
        'calls annotationMapper.delete() if the delete is confirmed',
        function(done) {
          var parts = createDirective();
          sandbox.stub($window, 'confirm').returns(true);
          fakeAnnotationMapper.deleteAnnotation.returns($q.resolve());
          parts.controller.delete().then(function() {
            assert.calledWith(fakeAnnotationMapper.deleteAnnotation,
                parts.annotation);
            done();
          });
          $timeout.flush();
        }
      );

      it(
        'doesn\'t call annotationMapper.delete() if the delete is cancelled',
        function(done) {
          var parts = createDirective();
          sandbox.stub($window, 'confirm').returns(false);
          parts.controller.delete().then(function() {
            assert.notCalled(fakeAnnotationMapper.deleteAnnotation);
            done();
          });
          $timeout.flush();
        }
      );

      it(
        'flashes a generic error if the server cannot be reached',
        function(done) {
          var controller = createDirective().controller;
          sandbox.stub($window, 'confirm').returns(true);
          fakeAnnotationMapper.deleteAnnotation.returns($q.reject({
            status: 0,
          }));
          controller.delete().then(function() {
            assert.calledWith(fakeFlash.error,
              'Service unreachable.', 'Deleting annotation failed');
            done();
          });
          $timeout.flush();
        }
      );

      it('flashes an error if the delete fails on the server', function(done) {
        var controller = createDirective().controller;
        sandbox.stub($window, 'confirm').returns(true);
        fakeAnnotationMapper.deleteAnnotation.returns($q.reject({
          status: 500,
          statusText: 'Server Error',
          data: {},
        }));
        controller.delete().then(function() {
          assert.calledWith(fakeFlash.error,
            '500 Server Error', 'Deleting annotation failed');
          done();
        });
        $timeout.flush();
      });

      it('doesn\'t flash an error if the delete succeeds', function(done) {
        var controller = createDirective().controller;
        sandbox.stub($window, 'confirm').returns(true);
        fakeAnnotationMapper.deleteAnnotation.returns($q.resolve());
        controller.delete().then(function() {
          assert.notCalled(fakeFlash.error);
          done();
        });
        $timeout.flush();
      });
    });

    describe('#documentMeta()', function () {
      it('returns the domain, title link and text for the annotation', function () {
        var annot = fixtures.defaultAnnotation();
        var controller = createDirective(annot).controller;
        assert.deepEqual(controller.documentMeta(), fakeDocumentMeta);
      });
    });

    describe('saving a new annotation', function() {
      var annotation;

      beforeEach(function() {
        annotation = fixtures.newAnnotation();
      });

      function createController() {
        return createDirective(annotation).controller;
      }

      it('removes the draft when saving an annotation succeeds', function () {
        var controller = createController();
        return controller.save().then(function () {
          assert.calledWith(fakeDrafts.remove, annotation);
        });
      });

      it('emits annotationCreated when saving an annotation succeeds', function () {
        var controller = createController();
        sandbox.spy($rootScope, '$emit');
        return controller.save().then(function() {
          assert.calledWith($rootScope.$emit, events.ANNOTATION_CREATED);
        });
      });

      it('flashes a generic error if the server can\'t be reached', function() {
        var controller = createController();
        fakeStore.annotation.create = sinon.stub().returns(Promise.reject({
          status: 0,
        }));
        return controller.save().then(function() {
          assert.calledWith(fakeFlash.error,
            'Service unreachable.', 'Saving annotation failed');
        });
      });

      it('flashes an error if saving the annotation fails on the server', function() {
        var controller = createController();
        fakeStore.annotation.create = sinon.stub().returns(Promise.reject({
          status: 500,
          statusText: 'Server Error',
          data: {},
        }));
        return controller.save().then(function() {
          assert.calledWith(fakeFlash.error,
            '500 Server Error', 'Saving annotation failed');
        });
      });

      it('doesn\'t flash an error when saving an annotation succeeds', function() {
        var controller = createController();
        return controller.save().then(function () {
          assert.notCalled(fakeFlash.error);
        });
      });

      it('shows a saving indicator when saving an annotation', function() {
        var controller = createController();
        var create;
        fakeStore.annotation.create = sinon.stub().returns(new Promise(function (resolve) {
          create = resolve;
        }));
        var saved = controller.save();
        assert.equal(controller.isSaving, true);
        create(Object.assign({}, controller.annotation, {id: 'new-id'}));
        return saved.then(function () {
          assert.equal(controller.isSaving, false);
        });
      });

      it('does not remove the draft if saving fails', function () {
        var controller = createController();
        fakeStore.annotation.create = sinon.stub().returns(Promise.reject({status: -1}));
        return controller.save().then(function () {
          assert.notCalled(fakeDrafts.remove);
        });
      });

      it('sets the annotation\'s group to the focused group', function() {
        fakeGroups.focused = function () {
          return { id: 'test-id' };
        };
        var controller = createDirective(fixtures.newAnnotation()).controller;
        assert.equal(controller.annotation.group, 'test-id');
      });
    });

    describe('saving an edited an annotation', function() {
      var annotation;

      beforeEach(function() {
        annotation = fixtures.defaultAnnotation();
        fakeDrafts.get.returns({text: 'unsaved change'});
      });

      function createController() {
        return createDirective(annotation).controller;
      }

      it('flashes a generic error if the server cannot be reached', function () {
        var controller = createController();
        fakeStore.annotation.update = sinon.stub().returns(Promise.reject({
          status: -1,
        }));
        return controller.save().then(function() {
          assert.calledWith(fakeFlash.error,
            'Service unreachable.', 'Saving annotation failed');
        });
      });

      it('flashes an error if saving the annotation fails on the server', function () {
        var controller = createController();
        fakeStore.annotation.update = sinon.stub().returns(Promise.reject({
          status: 500,
          statusText: 'Server Error',
          data: {},
        }));
        return controller.save().then(function() {
          assert.calledWith(fakeFlash.error,
            '500 Server Error', 'Saving annotation failed');
        });
      });

      it('doesn\'t flash an error if saving the annotation succeeds', function () {
        var controller = createController();
        return controller.save().then(function () {
          assert.notCalled(fakeFlash.error);
        });
      });
    });

    describe('drafts', function() {
      it('starts editing immediately if there is a draft', function() {
        fakeDrafts.get.returns({
          tags: ['unsaved'],
          text: 'unsaved-text',
        });
        var controller = createDirective().controller;
        assert.isTrue(controller.editing());
      });

      it('uses the text and tags from the draft if present', function() {
        fakeDrafts.get.returns({
          tags: ['unsaved-tag'],
          text: 'unsaved-text',
        });
        var controller = createDirective().controller;
        assert.deepEqual(controller.state().tags, ['unsaved-tag']);
        assert.equal(controller.state().text, 'unsaved-text');
      });

      it('removes the draft when changes are discarded', function() {
        var parts = createDirective();
        parts.controller.edit();
        parts.controller.revert();
        assert.calledWith(fakeDrafts.remove, parts.annotation);
      });

      it('removes the draft when changes are saved', function() {
        var annotation = fixtures.defaultAnnotation();
        var controller = createDirective(annotation).controller;
        fakeDrafts.get.returns({text: 'unsaved changes'});
        return controller.save().then(function() {
          assert.calledWith(fakeDrafts.remove, annotation);
        });
      });
    });

    describe('when another new annotation is created', function () {
      it('removes the current annotation if empty', function () {
        var annotation = fixtures.newEmptyAnnotation();
        createDirective(annotation);
        $rootScope.$emit(events.BEFORE_ANNOTATION_CREATED,
          fixtures.newAnnotation());
        assert.calledWith(fakeDrafts.remove, annotation);
      });

      it('does not remove the current annotation if is is not new', function () {
        createDirective(fixtures.defaultAnnotation());
        fakeDrafts.get.returns({text: '', tags: []});
        $rootScope.$emit(events.BEFORE_ANNOTATION_CREATED,
          fixtures.newAnnotation());
        assert.notCalled(fakeDrafts.remove);
      });

      it('does not remove the current annotation if the scope was destroyed', function () {
        var annotation = fixtures.newEmptyAnnotation();
        var parts = createDirective(annotation);
        parts.scope.$destroy();
        $rootScope.$emit(events.BEFORE_ANNOTATION_CREATED,
          fixtures.newAnnotation());
        assert.notCalled(fakeDrafts.remove);
      });

      it('does not remove the current annotation if it has text', function () {
        var annotation = fixtures.newAnnotation();
        createDirective(annotation);
        fakeDrafts.get.returns({text: 'An incomplete thought'});
        $rootScope.$emit(events.BEFORE_ANNOTATION_CREATED,
          fixtures.newAnnotation());
        assert.notCalled(fakeDrafts.remove);
      });

      it('does not remove the current annotation if it has tags', function () {
        var annotation = fixtures.newAnnotation();
        createDirective(annotation);
        fakeDrafts.get.returns({tags: ['a-tag']});
        $rootScope.$emit(events.BEFORE_ANNOTATION_CREATED,
          fixtures.newAnnotation());
        assert.notCalled(fakeDrafts.remove);
      });
    });

    describe('when the focused group changes', function() {
      it('moves new annotations to the focused group', function () {
        var annotation = fixtures.newAnnotation();
        annotation.group = 'old-group-id';
        createDirective(annotation);
        fakeGroups.focused = sandbox.stub().returns({id: 'new-group-id'});

        $rootScope.$broadcast(events.GROUP_FOCUSED);

        assert.equal(annotation.group, 'new-group-id');
      });

      it('does not move replies to the focused group', function () {
        var annotation = fixtures.newReply();
        fakeGroups.focused = sandbox.stub().returns({id: 'new-group-id'});
        createDirective(annotation);
        fakeGroups.focused = sandbox.stub().returns({id: 'new-group-id-2'});
        $rootScope.$broadcast(events.GROUP_FOCUSED);

        assert.equal(annotation.group, 'new-group-id');
      });

      it('does not modify the group of saved annotations', function () {
        var annotation = fixtures.oldAnnotation();
        annotation.group = 'old-group-id';
        createDirective(annotation);
        fakeGroups.focused = sandbox.stub().returns({id: 'new-group-id'});

        $rootScope.$broadcast(events.GROUP_FOCUSED);

        assert.equal(annotation.group, 'old-group-id');
      });
    });

    describe('reverting edits', function () {
      it('removes the current draft', function() {
        var controller = createDirective(fixtures.defaultAnnotation()).controller;
        controller.edit();
        controller.revert();
        assert.calledWith(fakeDrafts.remove, controller.annotation);
      });

      it('deletes the annotation if it was new', function () {
        var controller = createDirective(fixtures.newAnnotation()).controller;
        sandbox.spy($rootScope, '$emit');
        controller.revert();
        assert.calledWith($rootScope.$emit, events.ANNOTATION_DELETED);
      });
    });

    describe('tag display', function () {
      it('displays links to tags on the stream', function () {
        var directive = createDirective({
          id: '1234',
          tags: ['atag'],
        });
        var links = [].slice.apply(directive.element[0].querySelectorAll('a'));
        var tagLinks = links.filter(function (link) {
          return link.textContent === 'atag';
        });
        assert.equal(tagLinks.length, 1);
        assert.equal(tagLinks[0].href,
                     'https://test.hypothes.is/stream?q=tag:atag');
      });
    });

    describe('annotation links', function () {
      it('uses the in-context links when available', function () {
        var annotation = Object.assign({}, fixtures.defaultAnnotation(), {
          links: {
            html: 'https://test.hypothes.is/a/deadbeef',
            incontext: 'https://hpt.is/deadbeef',
          },
        });
        var controller = createDirective(annotation).controller;
        assert.equal(controller.links().incontext, annotation.links.incontext);
      });

      it('falls back to the HTML link when in-context links are missing', function () {
        var annotation = Object.assign({}, fixtures.defaultAnnotation(), {
          links: {
            html: 'https://test.hypothes.is/a/deadbeef',
          },
        });
        var controller = createDirective(annotation).controller;
        assert.equal(controller.links().html, annotation.links.html);
      });

      it('uses the HTML link when available', function () {
        var annotation = Object.assign({}, fixtures.defaultAnnotation(), {
          links: {
            html: 'https://test.hypothes.is/a/deadbeef',
            incontext: 'https://hpt.is/deadbeef',
          },
        });
        var controller = createDirective(annotation).controller;
        assert.equal(controller.links().html, annotation.links.html);
      });

      it('in-context link is blank when unknown', function () {
        var annotation = fixtures.defaultAnnotation();
        var controller = createDirective(annotation).controller;
        assert.equal(controller.links().incontext, '');
      });

      it('HTML is blank when unknown', function () {
        var annotation = fixtures.defaultAnnotation();
        var controller = createDirective(annotation).controller;
        assert.equal(controller.links().html, '');
      });
    });
  });
});
