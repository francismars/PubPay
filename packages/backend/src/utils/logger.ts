// Logger - Centralized logging utility
export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const contextStr = `[${this.context}]`;
    const levelStr = `[${level}]`;
    
    if (data) {
      return `${timestamp} ${levelStr} ${contextStr} ${message} ${JSON.stringify(data)}`;
    }
    
    return `${timestamp} ${levelStr} ${contextStr} ${message}`;
  }

  info(message: string, data?: any): void {
    console.log(this.formatMessage('INFO', message, data));
  }

  warn(message: string, data?: any): void {
    console.warn(this.formatMessage('WARN', message, data));
  }

  error(message: string, data?: any): void {
    console.error(this.formatMessage('ERROR', message, data));
  }

  debug(message: string, data?: any): void {
    if (process.env['NODE_ENV'] === 'development') {
      console.debug(this.formatMessage('DEBUG', message, data));
    }
  }
}
