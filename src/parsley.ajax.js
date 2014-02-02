window.ParsleyExtend = $.extend(window.ParsleyExtend || {}, {
  asyncValidate: function (group, event) {
    if ('ParsleyForm' === this.__class__)
      return this._asyncValidateForm(group, event);

    return this._asyncValidateField();
  },

  asyncIsValid: function (group) {
    if ('ParsleyField' === this.__class__)
      return this._asyncIsValidField();

    return this._asyncIsValidForm(group);
  },

  onSubmitValidate: function (event) {
    var that = this;
    event.preventDefault();

    return this._asyncValidateForm(undefined, event)
      .done(function () {
        that.$element
          .off('submit.Parsley')
          .trigger($.Event('submit'));
      });
  },

  eventValidate: function (event) {
    // For keyup, keypress, keydown.. events that could be a little bit obstrusive
    // do not validate if val length < min tresshold on first validation. Once field have been validated once,
    // always validate with this trigger to reflect every yalidation change.
    if (new RegExp('key').test(event.type))
      if ('undefined' === typeof this._ui.eventValidatedOnce && this.getValue().length <= this.options.validationTresshold)
        return;

    this._ui.eventValidatedOnce = true;
    this.asyncValidate();
  },

  // Returns Promise
  _asyncValidateForm: function (group, event) {
    var that = this,
      promises = [];
    this.submitEvent = event;

    this.refreshFields();

    $.emit('parsley:form:validate', this);

    for (var i = 0; i < this.fields.length; i++) {

      // do not validate a field if not the same as given validation group
      if (group && group !== this.fields[i].options.group)
        continue;

      promises.push(this.fields[i]._asyncValidateField());
    }

    return $.when.apply($, promises);
  },

  _asyncIsValidForm: function () {
    var promises = [];
    this.refreshFields();

    for (var i = 0; i < this.fields.length; i++) {

      // do not validate a field if not the same as given validation group
      if (group && group !== this.fields[i].options.group)
        continue;

      promises.push(this.fields[i]._asyncIsValidField());
    }

    return $.when.apply($, promises);
  },

  _asyncValidateField: function () {
    var that = this;

    $.emit('parsley:field:validate', this);

    return this._asyncIsValidField()
      .done(function () {
        $.emit('parsley:field:success', that)
      })
      .fail(function () {
        $.emit('parsley:field:error', that)
      })
      .always(function () {
        $.emit('parsley:field:validated', that)
      });
  },

  _asyncIsValidField: function () {
    var deferred = $.Deferred(),
      remoteConstraintIndex;

    // If regular isValid (matching regular constraints) retunrs `false`, no need to go further
    // Directly reject promise, do not run remote validator and save server load
    if (false === this.isValid())
      deferred.rejectWith(this);

    // If regular constraints are valid, and there is a remote validator registered, run it
    else if (-1 !== this.indexOfConstraint('remote'))
      this._remote(deferred);

    // Otherwise all is good, resolve promise
    else
      deferred.resolveWith(this);

    // Return promise
    return deferred.promise();
  },

  _remote: function (deferred) {
    var promise,
      data = {},
      that = this,
      value = this.getValue(),
      csr = value + this.$element.attr(this.options.namespace + 'remote-options');

    // Already validated values are stored to save some calls..
    if ('undefined' !== typeof this._remote && 'undefined' !== typeof this._remote[csr])
      promise = this._remote[csr] ? deferred.resolveWith(that) : deferred.rejectWith(that);
    else {
      data[that.$element.attr('name') || that.$element.attr('id')] = value;

      promise = $.ajax($.extend({
        url: that.options.remote,
        data: data,
        type: 'GET'
      }, that.options.remoteOptions || {}));
    }
    // Depending on promise result, manage `validationResult` for UI
    promise
      .done(function () {
        that._remote[csr] = true;
        that.validationResult = false !== that.validationResult;
        deferred.resolveWith(that)
      })
      .fail(function () {
        that._remote[csr] = false;
        that.validationResult = [
          new window.ParsleyValidator.Validator.Violation(
            that.constraints[that.indexOfConstraint('remote')],
            value,
            null
          )
        ];

        deferred.rejectWith(that)
      });
  }
});

window.ParsleyConfig = $.extend(window.ParsleyConfig || {}, {
  validators: {
    // Remote validator is just an always true sync validator with lowest (-1) priority possible
    // It will be overloaded in `validateThroughValidator()` that will do the heavy async work
    remote: {
      fn: function () {
        return true;
      },
      priority: -1
    }
  }
});
