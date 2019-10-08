function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}

function append(target, node) {
    target.appendChild(node);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function element(name) {
    return document.createElement(name);
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function custom_event(type, detail) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, false, false, detail);
    return e;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error(`Function called outside component initialization`);
    return current_component;
}
function beforeUpdate(fn) {
    get_current_component().$$.before_update.push(fn);
}
function afterUpdate(fn) {
    get_current_component().$$.after_update.push(fn);
}
function createEventDispatcher() {
    const component = current_component;
    return (type, detail) => {
        const callbacks = component.$$.callbacks[type];
        if (callbacks) {
            // TODO are there situations where events could be dispatched
            // in a server (non-DOM) environment?
            const event = custom_event(type, detail);
            callbacks.slice().forEach(fn => {
                fn.call(component, event);
            });
        }
    };
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
function flush() {
    const seen_callbacks = new Set();
    do {
        // first, call beforeUpdate functions
        // and update components
        while (dirty_components.length) {
            const component = dirty_components.shift();
            set_current_component(component);
            update(component.$$);
        }
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                callback();
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
}
function update($$) {
    if ($$.fragment) {
        $$.update($$.dirty);
        run_all($$.before_update);
        $$.fragment.p($$.dirty, $$.ctx);
        $$.dirty = null;
        $$.after_update.forEach(add_render_callback);
    }
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}

const globals = (typeof window !== 'undefined' ? window : global);
function mount_component(component, target, anchor) {
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment.m(target, anchor);
    // onMount happens before the initial afterUpdate
    add_render_callback(() => {
        const new_on_destroy = on_mount.map(run).filter(is_function);
        if (on_destroy) {
            on_destroy.push(...new_on_destroy);
        }
        else {
            // Edge case - component was destroyed immediately,
            // most likely as a result of a binding initialising
            run_all(new_on_destroy);
        }
        component.$$.on_mount = [];
    });
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    if (component.$$.fragment) {
        run_all(component.$$.on_destroy);
        component.$$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        component.$$.on_destroy = component.$$.fragment = null;
        component.$$.ctx = {};
    }
}
function make_dirty(component, key) {
    if (!component.$$.dirty) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty = blank_object();
    }
    component.$$.dirty[key] = true;
}
function init(component, options, instance, create_fragment, not_equal, prop_names) {
    const parent_component = current_component;
    set_current_component(component);
    const props = options.props || {};
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
        // state
        props: prop_names,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        before_update: [],
        after_update: [],
        context: new Map(parent_component ? parent_component.$$.context : []),
        // everything else
        callbacks: blank_object(),
        dirty: null
    };
    let ready = false;
    $$.ctx = instance
        ? instance(component, props, (key, ret, value = ret) => {
            if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                if ($$.bound[key])
                    $$.bound[key](value);
                if (ready)
                    make_dirty(component, key);
            }
            return ret;
        })
        : props;
    $$.update();
    ready = true;
    run_all($$.before_update);
    $$.fragment = create_fragment($$.ctx);
    if (options.target) {
        if (options.hydrate) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment.l(children(options.target));
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor);
        flush();
    }
    set_current_component(parent_component);
}
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set() {
        // overridden by instance, if it has props
    }
}

/* src\textbox-cell.svelte generated by Svelte v3.12.1 */
const { document: document_1 } = globals;

function add_css() {
	var style = element("style");
	style.id = 'svelte-6j3h95-style';
	style.textContent = ".textbox-cell.svelte-6j3h95{position:relative;width:100%;height:100%;background:white;z-index:3}input.svelte-6j3h95{height:100%;width:100%;border:0;margin:0;padding:0 5px;box-sizing:border-box}input.svelte-6j3h95:active,input.svelte-6j3h95:focus{border:1px solid lime}";
	append(document_1.head, style);
}

function create_fragment(ctx) {
	var div, input, dispose;

	return {
		c() {
			div = element("div");
			input = element("input");
			attr(input, "type", "text");
			attr(input, "class", "svelte-6j3h95");
			attr(div, "class", "textbox-cell svelte-6j3h95");

			dispose = [
				listen(input, "input", ctx.onInput),
				listen(input, "focus", ctx.onFocus),
				listen(input, "blur", ctx.onBlur)
			];
		},

		m(target, anchor) {
			insert(target, div, anchor);
			append(div, input);
			ctx.input_binding(input);
		},

		p: noop,
		i: noop,
		o: noop,

		d(detaching) {
			if (detaching) {
				detach(div);
			}

			ctx.input_binding(null);
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	  
  const dispatch = createEventDispatcher();

  let { textbox = null, column, rowNumber, row } = $$props;

  let prevColumn;
  let prevRow;
  // [svelte-upgrade warning]
  // beforeUpdate and afterUpdate handlers behave
  // differently to their v2 counterparts
  beforeUpdate(() => {
    if ((prevColumn !== column || prevRow !== row)) {      
      const updateTextbox = () => {
        if (textbox)
          $$invalidate('textbox', textbox.value = row.data[column.dataName], textbox);
      };
      if (textbox) {
        updateTextbox();
      } else {
        setTimeout(updateTextbox, 0);
      }
      prevColumn = column;
    }
  });

  // [svelte-upgrade warning]
  // beforeUpdate and afterUpdate handlers behave
  // differently to their v2 counterparts
  afterUpdate(() => {
    /* Since data-grid isn't using a keyed each block to display the rows, we need to update
      the focus as the grid scrolls. When this cell component receives a new row, check if the column's active row
      is this row, and focus or blur if necessary */
    if (prevRow !== row) {
      if (column.activeRow && column.activeRow === rowNumber && textbox) {
        textbox.focus();
      } else if (textbox === document.activeElement) {
        textbox.blur();
      }
       prevRow = row;
    }
  });

  // [svelte-upgrade suggestion]
  // review these functions and remove unnecessary 'export' keywords
  function onFocus(event) {
    $$invalidate('column', column.activeRow = rowNumber, column);
  }

  function onBlur(event) {
    // if blur event was user-initiated and not initiated by the blur call above,
    // remove the activeRow property
    if (event.sourceCapabilities) {
      delete column.activeRow;
    }
  }

  function onInput(event) {
    const value = textbox.value;
    setTimeout(() => {
      dispatch('valueupdate', {
        row,
        column,
        value,
        rowNumber
      });
    }, 0);     
  }

	function input_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			$$invalidate('textbox', textbox = $$value);
		});
	}

	$$self.$set = $$props => {
		if ('textbox' in $$props) $$invalidate('textbox', textbox = $$props.textbox);
		if ('column' in $$props) $$invalidate('column', column = $$props.column);
		if ('rowNumber' in $$props) $$invalidate('rowNumber', rowNumber = $$props.rowNumber);
		if ('row' in $$props) $$invalidate('row', row = $$props.row);
	};

	return {
		textbox,
		column,
		rowNumber,
		row,
		onFocus,
		onBlur,
		onInput,
		input_binding
	};
}

class Textbox_cell extends SvelteComponent {
	constructor(options) {
		super();
		if (!document_1.getElementById("svelte-6j3h95-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, ["textbox", "column", "rowNumber", "row", "onFocus", "onBlur", "onInput"]);
	}

	get onFocus() {
		return this.$$.ctx.onFocus;
	}

	get onBlur() {
		return this.$$.ctx.onBlur;
	}

	get onInput() {
		return this.$$.ctx.onInput;
	}
}

export default Textbox_cell;
