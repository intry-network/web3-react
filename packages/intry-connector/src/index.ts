import { ConnectorUpdate } from '@web3-react/types'
import { AbstractConnector } from '@web3-react/abstract-connector'
import warning from 'tiny-warning'
import { IntryInitOptions } from "@intry/sdk"

import { SendReturnResult, SendReturn } from './types'

function parseSendReturn(sendReturn: SendReturnResult | SendReturn): any {
  return sendReturn.hasOwnProperty('result') ? sendReturn.result : sendReturn
}

export class UserRejectedRequestError extends Error {
  public constructor() {
    super()
    this.name = this.constructor.name
    this.message = 'The user rejected the request.'
  }
}

export class IntryConnector extends AbstractConnector {
  intrySdk: any;

  initOptions: IntryInitOptions;

  constructor(_initOptions: IntryInitOptions = {}, initializeImmediately: boolean = false) {
    super({ supportedChainIds: [137] })

    this.initOptions = _initOptions;
    if (initializeImmediately) {
        this.init();
    }
  }

  public async init(): Promise<void> {
      const IntrySdk = await import('@intry/sdk').then(m => m?.default ?? m);
      if (!this.intrySdk) {
          this.intrySdk = new IntrySdk();
          await this.intrySdk.init(this.initOptions);
      }
  }

  public async activate(): Promise<ConnectorUpdate> {
    if (!this.intrySdk || !this.intrySdk.initialized) {
        await this.init();
    }

    let account
    try {
      account = await this.intrySdk.request({ method: 'eth_requestAccounts' }).then(
        (sendReturn: any) => parseSendReturn(sendReturn)[0]
      )
    } catch (error) {
      if ((error as any).code === 4001) {
        throw new UserRejectedRequestError()
      }
      warning(false, 'eth_requestAccounts was unsuccessful, falling back to enable')
    }

    return { provider: this.intrySdk, ...(account ? { account } : {}) }
  }

  public async getProvider(): Promise<any> {
    return this.intrySdk;
  }

  public async getChainId(): Promise<number | string> {
    let chainId
    try {
      chainId = await this.intrySdk.request({ method: 'eth_chainId' }).then(parseSendReturn)
    } catch (e) {
      warning(false, 'eth_chainId was unsuccessful, falling back to net_version')
    }

    if (!chainId) {
      try {
        chainId = await this.intrySdk.request({ method: 'net_version' }).then(parseSendReturn)
      } catch {
        warning(false, 'net_version was unsuccessful, falling back to net version v2')
      }
    }

    if (!chainId) {
      try {
        chainId = parseSendReturn(await this.intrySdk.request({ method: 'net_version' }))
      } catch {
        warning(false, 'net_version v2 was unsuccessful, falling back to manual matches and static properties')
      }
    }

    return chainId
  }

  public async getAccount(): Promise<null | string> {
    let account
    try {
      account = await this.intrySdk.request({ method: 'eth_accounts' }).then((sendReturn: any) => parseSendReturn(sendReturn)[0])
    } catch (e) {
      warning(false, 'eth_accounts was unsuccessful, falling back to enable')
    }

    if (!account) {
      account = parseSendReturn(await this.intrySdk.request({ method: 'eth_accounts' }))[0]
    }

    return account
  }

  public deactivate() {
    this.intrySdk.close();
    // this.intrySdk.closeAndRemove();
  }

  public close() {
      this.intrySdk.close();
  }

  public async isAuthorized(): Promise<boolean> {
    try {
      return await this.intrySdk.request({ method: 'eth_accounts' }).then((sendReturn: any) => {
        if (parseSendReturn(sendReturn).length > 0) {
          return true
        } else {
          return false
        }
      })
    } catch {
      return false
    }
  }
}
