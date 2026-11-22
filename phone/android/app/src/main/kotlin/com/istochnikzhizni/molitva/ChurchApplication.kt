package com.istochnikzhizni.molitva

import android.app.Application

/** Каналы уведомлений создаются при любом старте процесса — в том числе когда его разбудил пуш при закрытом приложении. */
class ChurchApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        NotificationChannels.ensure(this)
    }
}
