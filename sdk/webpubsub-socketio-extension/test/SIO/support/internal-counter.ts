export class InternalCounter {
  private _counter = 0;

  public updateAndGetInternalCounter() {
    // Too large counter => Too large port number
    this._counter = (this._counter + 1) % 5000;
  
    return this._counter;
  };

  public getInternalCounter()  {
    return this._counter;
  };
}