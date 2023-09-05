function Diagram(element, tools) {
  this._element = element;
  this._tools = tools;
  this._id = null;
  this._shapes = {};
  this._past = [];
  this._future = [];
  this._timestamp = 0;
  this._buffer = [];
  this._background = null;
  this._scale = 1;
  this._offset = [0, 0];
  this._shapeUpdateCallback = this._shapePatchCallback = this._shapeRemoveCallback = this._shapeAddCallback = this._clearCallback = this._historyChangeCallback = () => { };
}

function generateId() {
  return Math.floor((1 + Math.random()) * 0x100000000).toString(16).substring(1);
}

function applyStyle(e, c, w) {
  return e.fill('none').stroke({ color: c, width: w, linecap: 'round' });
}

Diagram.prototype._tryNotify = function (c) {
  let t = new Date().getTime();
  if (t - this._timestamp < 250) return;
  c();
  this._timestamp = t;
}

Diagram.prototype._historyChange = function () {
  this._historyChangeCallback(this._past.length > 0, this._future.length > 0);
}

Diagram.prototype._translate = function (x, y) {
  return [this._offset[0] + x / this._scale, this._offset[1] + y / this._scale];
}

Diagram.prototype.startShape = function (k, c, w, x, y) {
  if (this._id) return;
  this._id = generateId();
  [x, y] = this._translate(x, y);
  let m = { kind: k, color: c, width: w, data: this._tools[k].start(x, y) };
  this._shapes[this._id] = { view: applyStyle(this._tools[k].draw(this._element, m.data), c, w), model: m };
  this._future = [];
  this._past.push(this._id);
  this._historyChange();
  this._shapeUpdateCallback(this._id, m);
};

Diagram.prototype.drawShape = function (x, y) {
  if (!this._id) return;
  [x, y] = this._translate(x, y);
  let s = this._shapes[this._id];
  let t = this._tools[s.model.kind];
  let d = t.move(x, y, s.model.data);
  t.update(s.view, s.model.data);
  if (d) {
    this._buffer = this._buffer.concat(d);
    this._tryNotify(() => {
      this._shapePatchCallback(this._id, this._buffer);
      this._buffer = [];
    });
  } else this._tryNotify(() => this._shapeUpdateCallback(this._id, s.model));
}

Diagram.prototype.endShape = function () {
  if (!this._id) return;
  if (this._buffer.length > 0) {
    this._shapePatchCallback(this._id, this._buffer);
    this._buffer = [];
  } else this._shapeUpdateCallback(this._id, this._shapes[this._id].model);
  this._shapeAddCallback(this._id, this._shapes[this._id].model);
  this._id = null;
}

Diagram.prototype.updateShape = function (i, m) {
  if (this._shapes[i]) this._tools[m.kind].update(this._shapes[i].view, this._shapes[i].model.data = m.data);
  else this._shapes[i] = { view: applyStyle(this._tools[m.kind].draw(this._element, m.data), m.color, m.width), model: m };
}

Diagram.prototype.patchShape = function (i, d) {
  if (this._shapes[i]) this._tools[this._shapes[i].model.kind].update(this._shapes[i].view, this._shapes[i].model.data = this._shapes[i].model.data.concat(d));
}

Diagram.prototype.removeShape = function (i) {
  if (!this._shapes[i]) return;
  this._shapes[i].view.remove();
  delete this._shapes[i];
}

Diagram.prototype.clear = function () {
  this.removeAll();
  this._clearCallback();
}

Diagram.prototype.removeAll = function () {
  this._id = null;
  this._shapes = {};
  this._past = [], this._future = [];
  this._timestamp = 0;
  this._buffer = [];
  this._background = null;
  this._element.clear();
  this._historyChange();
}

Diagram.prototype.updateBackground = function (file) {
  if (this._background) this._background.remove();
  this._background = this._element.image(file).back();
}

Diagram.prototype.resizeViewbox = function (w, h) {
  let v = this._element.viewbox();
  this._element.viewbox(v.x, v.y, w / this._scale, h / this._scale);
}

Diagram.prototype.pan = function (dx, dy) {
  let v = this._element.viewbox();
  this._offset = [v.x + dx / this._scale, v.y + dy / this._scale];
  this._element.viewbox(this._offset[0], this._offset[1], v.width, v.height);
}

Diagram.prototype.zoom = function (r) {
  this._scale *= r;
  let v = this._element.viewbox();
  this._element.viewbox(v.x, v.y, v.width / r, v.height / r);
}

Diagram.prototype.undo = function () {
  let i = this._past.pop();
  if (!i) return;
  this._future.push(this._shapes[i].model);
  this.removeShape(i);
  this._shapeRemoveCallback(i);
  this._historyChange();
}

Diagram.prototype.redo = function () {
  let m = this._future.pop();
  if (!m) return;
  let i = generateId();
  this.updateShape(i, m);
  this._shapeUpdateCallback(i, m);
  this._shapeAddCallback(i, m);
  this._past.push(i);
  this._historyChange();
}

Diagram.prototype.onShapeUpdate = function (c) { this._shapeUpdateCallback = c };
Diagram.prototype.onShapeAdd = function (c) { this._shapeAddCallback = c };
Diagram.prototype.onShapeRemove = function (c) { this._shapeRemoveCallback = c };
Diagram.prototype.onShapePatch = function (c) { this._shapePatchCallback = c };
Diagram.prototype.onClear = function (c) { this._clearCallback = c };
Diagram.prototype.onHistoryChange = function (c) { this._historyChangeCallback = c; }

export default Diagram;