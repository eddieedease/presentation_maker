FROM php:8.3-apache

# GD powers the image uploads: every upload is decoded and re-encoded, which is
# what strips metadata and any payload hidden inside the original file.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpng-dev libjpeg62-turbo-dev libwebp-dev libfreetype6-dev \
    && docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
    && docker-php-ext-install -j"$(nproc)" gd pdo pdo_mysql \
    && apt-get purge -y --auto-remove \
    && rm -rf /var/lib/apt/lists/* \
    && a2enmod rewrite headers \
    && mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"

# Uploads are larger than PHP's stock 2M form limit.
RUN { \
      echo 'upload_max_filesize = 12M'; \
      echo 'post_max_size = 16M'; \
    } > "$PHP_INI_DIR/conf.d/uploads.ini"

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
    && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

WORKDIR /var/www/html
COPY backend/ /var/www/html/
